import hashlib
import logging
import re
import time
from datetime import datetime, timezone

from sqlalchemy import text

from src.chunker.fixed_length_chunker import FixedLengthChunker
from src.chunker.semantic_chunker import SemanticChunker
from src.chunker.llm_chunker import LLMChunker
from src.cleaner.text_cleaner import TextCleaner
from src.config import AppConfig
from src.db.models import EmbedTask, KnowledgeClean, KnowledgeStructured
from src.db.session import get_session
from src.embedding_client import EmbeddingClient
from src.kafka_producer import EmbedTaskMessage, FileIngestMessage, KafkaProducer
from src.minio_client import MinioClient
from src.parser.tika_parser import TikaParser
from src.parser import ParseResult
from src.utils.metadata_extractor import MetadataExtractor
from src.chunker import ChunkResult
from src.cleaner import CleanResult

logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 16

CHUNK_TYPE_RULES = [
    (r"定义|是指|指的是|指一种|意为|即", "definition"),
    (r"步骤|流程|操作|点击|输入|执行|运行|构建|部署|安装|配置", "procedure"),
    (r"如何|怎么做|怎样|怎么", "procedure"),
    (r"第.*条|第.*章|规定|必须|禁止|不得|应当|应", "rule"),
    (r"例如|示例|举例|比如|案例", "example"),
    (r"免责|不承担|不保证|风险提示|注意", "disclaimer"),
]

# 中文停用词表 (常见高频无意义词)
_STOP_WORDS = {
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
    "没有", "看", "好", "自己", "这", "他", "她", "它", "们", "那", "些",
    "所", "为", "所以", "因为", "但是", "然而", "而且", "虽然", "如果",
    "可以", "这个", "那个", "什么", "怎么", "如何", "为什么", "吗", "呢",
    "啊", "吧", "被", "把", "从", "对", "与", "及", "或", "等", "其",
    "其中", "之", "则", "且", "并", "而", "以", "于", "已", "应", "该",
    "本", "各", "某", "此", "前", "后", "中", "已", "将", "能", "更",
}


class Pipeline:
    def __init__(self, config: AppConfig, producer: KafkaProducer):
        self._config = config
        self._producer = producer
        self._parser = TikaParser(config.tika, config.mvp_limits)
        self._cleaner = TextCleaner()
        self._minio = MinioClient(config.minio)
        self._embedding = EmbeddingClient(config.embedding)
        self._metadata_extractor = MetadataExtractor(
            keyword_top_n=config.metadata_extractor.keyword_top_n,
            summary_max_chars=config.metadata_extractor.summary_max_chars,
            short_text_threshold=config.metadata_extractor.short_text_threshold,
            allow_pos=config.metadata_extractor.allow_pos,
            custom_dict_path=config.metadata_extractor.custom_dict_path,
            llm_enabled=config.metadata_extractor.llm_enabled,
            llm_gateway_url=config.metadata_extractor.llm_gateway_url,
            llm_model=config.metadata_extractor.llm_model,
            llm_batch_size=config.metadata_extractor.llm_batch_size,
            llm_timeout_seconds=config.metadata_extractor.llm_timeout_seconds,
        )
        self._current_metadata: list[dict] = []

    def process_message(self, msg: FileIngestMessage):
        logger.info(
            f"Pipeline start: docId={msg.doc_id}, version={msg.version}, "
            f"traceId={msg.trace_id}"
        )

        try:
            self._update_document_stage(msg, "PARSING")
            file_bytes = self._minio.get_object(msg.src_path)
            parse_result = self._parse(file_bytes, msg)
            clean_result = self._clean(parse_result, msg)
            self._update_document_stage(msg, "CHUNKING")
            chunks = self._chunk(clean_result, msg)
            self._extract_metadata(chunks)
            self._update_document_stage(msg, "EMBEDDING")
            vectors = self._embed(chunks)
            self._update_document_stage(msg, "VECTOR_PENDING")
            self._save_results(msg, parse_result, clean_result, chunks)
            self._publish_embed_tasks(msg, parse_result, chunks, vectors)
        except Exception as exc:
            self._mark_document_failed(msg, exc)
            raise

        logger.info(
            f"Pipeline done: docId={msg.doc_id}, chunks={len(chunks.chunks)}, "
            f"quality={clean_result.quality_score}"
        )

    def _parse(self, file_bytes: bytes, msg: FileIngestMessage) -> ParseResult:
        result = self._parser.parse(file_bytes)
        result.trace_id = msg.trace_id
        result.metadata.setdefault("title", "")
        result.metadata.setdefault("author", "")
        result.metadata.setdefault("pageCount", result.page_count)
        result.metadata["parseMethod"] = "TIKA"
        return result

    def _clean(self, parse_result: ParseResult, msg: FileIngestMessage) -> CleanResult:
        result = self._cleaner.clean(parse_result.full_text)
        result.trace_id = msg.trace_id
        return result

    def _chunk(self, clean_result: CleanResult, msg: FileIngestMessage) -> ChunkResult:
        chunk_cfg = msg.chunk_config
        chunk_mode = chunk_cfg.get("chunkMode", self._config.chunk_defaults.chunk_mode)
        chunk_size = chunk_cfg.get("chunkSize", self._config.chunk_defaults.chunk_size)
        overlap_ratio = chunk_cfg.get("overlapRatio", self._config.chunk_defaults.overlap_ratio)
        smart_cfg = self._config.chunk_defaults.smart

        if chunk_mode == "SMART_LLM":
            chunker = LLMChunker(
                config=self._config.intelligent_chunker,
                chunk_size=chunk_size,
                overlap_ratio=overlap_ratio,
                smart_config=smart_cfg,
            )
        elif chunk_mode == "SMART":
            chunker = SemanticChunker(
                chunk_size=chunk_size,
                overlap_ratio=overlap_ratio,
                parent_max_size=smart_cfg.parent_max_size,
                child_size=smart_cfg.child_size,
                child_overlap=smart_cfg.child_overlap,
            )
        else:
            chunker = FixedLengthChunker(
                chunk_size=chunk_size,
                overlap_ratio=overlap_ratio,
                mode=chunk_mode,
            )

        result = chunker.chunk(clean_result.cleaned_text)
        result.trace_id = msg.trace_id
        return result

    def _embed(self, chunks: ChunkResult) -> list[list[float]]:
        if not chunks.chunks:
            return []

        texts = [c.text for c in chunks.chunks]
        all_vectors: list[list[float]] = []

        for batch_start in range(0, len(texts), EMBED_BATCH_SIZE):
            batch = texts[batch_start : batch_start + EMBED_BATCH_SIZE]
            vectors = self._embedding.embed(batch)
            all_vectors.extend(vectors)
            logger.info(
                f"Embedded batch {batch_start // EMBED_BATCH_SIZE + 1}: "
                f"{len(batch)} chunks → {len(vectors)} vectors, dim={len(vectors[0]) if vectors else 'N/A'}"
            )

        return all_vectors

    def _extract_metadata(self, chunks: ChunkResult):
        """批量提取所有 chunk 的关键词和摘要，存储到 self._current_metadata。"""
        if not chunks.chunks:
            self._current_metadata = []
            return

        batch_input = [
            {"text": c.text, "is_parent": c.is_parent}
            for c in chunks.chunks
        ]
        self._current_metadata = self._metadata_extractor.extract_batch(batch_input)
        logger.info(
            f"Metadata extracted for {len(chunks.chunks)} chunks "
            f"(llm_enabled={self._metadata_extractor.llm_enabled})"
        )

    @staticmethod
    def _infer_chunk_type(text: str) -> str:
        for pattern, ctype in CHUNK_TYPE_RULES:
            if re.search(pattern, text):
                return ctype
        return ""

    def _save_results(
        self,
        msg: FileIngestMessage,
        parse_result: ParseResult,
        clean_result: CleanResult,
        chunks: ChunkResult,
    ):
        session = get_session()
        try:
            clean_record = KnowledgeClean(
                tenant_id=msg.tenant_id,
                doc_id=msg.doc_id,
                src_path=msg.src_path,
                sha256=msg.sha256,
                cleaned_text=clean_result.cleaned_text,
                language="zh",
                parse_method="TIKA",
                quality_score=clean_result.quality_score,
                meta_json={
                    "title": parse_result.metadata.get("title", ""),
                    "author": parse_result.metadata.get("author", ""),
                    "pageCount": parse_result.page_count,
                    "parseMethod": "TIKA",
                },
            )
            session.add(clean_record)

            # knowledge_structured 保留 Parent/Child 元数据
            # Group chunks by section_path
            sections_map: dict[str, list] = {}
            for i, chunk in enumerate(chunks.chunks):
                key = chunk.section_path or ""
                sections_map.setdefault(key, []).append(chunk)

            sections = []
            for section_path, section_chunks in sections_map.items():
                first = section_chunks[0]
                sections.append({
                    "section_path": section_path or None,
                    "page": first.page,
                    "paragraphs": [
                        {
                            "text": c.text,
                            "chunkSeq": c.chunk_seq,
                            "isParent": c.is_parent,
                            "parentRef": c.parent_ref,
                        }
                        for c in section_chunks
                    ],
                })

            structured_body = {
                "sections": sections,
                "traceId": msg.trace_id,
            }
            structured_record = KnowledgeStructured(
                tenant_id=msg.tenant_id,
                doc_id=msg.doc_id,
                version=msg.version,
                json_body=structured_body,
                extractor_ver="v2",
            )
            session.add(structured_record)

            now = datetime.now(timezone.utc)
            current_parent_seq = None
            for i, chunk in enumerate(chunks.chunks):
                text_hash = hashlib.sha256(chunk.text.encode("utf-8")).hexdigest()

                if chunk.is_parent:
                    current_parent_seq = chunk.chunk_seq
                    parent_ref = f"{msg.doc_id}/{msg.version}/{chunk.chunk_seq}"
                else:
                    parent_ref = f"{msg.doc_id}/{msg.version}/{current_parent_seq}" if current_parent_seq is not None else ""

                embed_task = EmbedTask(
                    tenant_id=msg.tenant_id,
                    doc_id=msg.doc_id,
                    version=msg.version,
                    chunk_seq=chunk.chunk_seq,
                    text_hash=text_hash,
                    title=parse_result.metadata.get("title", ""),
                    section_path=chunk.section_path,
                    page=chunk.page,
                    dept_id=msg.dept_id,
                    sec_level=msg.sec_level,
                    region_code=msg.region_code,
                    biz_domain=msg.biz_domain,
                    perm_group_id=1,  # PHASE2: 从 doc_acl 表计算 perm_group_id
                    acl_version=1,
                    tags=msg.label_tags,
                    chunk_type=Pipeline._infer_chunk_type(chunk.text),
                    parent_ref=parent_ref,
                    is_parent=chunk.is_parent,
                    keywords=self._current_metadata[i].get("keywords", "") if i < len(self._current_metadata) else "",
                    summary=self._current_metadata[i].get("summary", "") if i < len(self._current_metadata) else "",
                    status="PENDING",
                    retry_count=0,
                    max_retries=self._config.retry.max_retries,
                    created_at=now,
                    updated_at=now,
                )
                session.add(embed_task)

            session.commit()
            logger.info(f"Saved to DB: clean+structured+{len(chunks.chunks)} embed_tasks")
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _publish_embed_tasks(
        self,
        msg: FileIngestMessage,
        parse_result: ParseResult,
        chunks: ChunkResult,
        vectors: list[list[float]],
    ):
        now_ts = int(time.time() * 1000)
        title = parse_result.metadata.get("title") or msg.src_path.split("/")[-1]
        current_parent_seq = None

        for i, chunk in enumerate(chunks.chunks):
            text_hash = hashlib.sha256(chunk.text.encode("utf-8")).hexdigest()
            vector = vectors[i] if i < len(vectors) else None

            if chunk.is_parent:
                current_parent_seq = chunk.chunk_seq
                parent_ref = f"{msg.doc_id}/{msg.version}/{chunk.chunk_seq}"
            else:
                parent_ref = f"{msg.doc_id}/{msg.version}/{current_parent_seq}" if current_parent_seq is not None else ""

            embed_msg = EmbedTaskMessage(
                trace_id=msg.trace_id,
                tenant_id=msg.tenant_id,
                doc_id=msg.doc_id,
                version=msg.version,
                chunk_seq=chunk.chunk_seq,
                text=chunk.text,
                text_hash=text_hash,
                title=title,
                section_path=chunk.section_path,
                page=chunk.page,
                sec_level=msg.sec_level,
                region_code=msg.region_code,
                biz_domain=msg.biz_domain,
                perm_group_id=1,  # PHASE2: 从 doc_acl 表计算 perm_group_id
                acl_version=1,
                owner_uid=msg.owner_uid,
                dept_id=msg.dept_id,
                effective_from=msg.effective_from,
                effective_to=msg.effective_to,
                create_time=now_ts,
                tags=msg.label_tags,
                chunk_type=Pipeline._infer_chunk_type(chunk.text),
                vector=vector,
                parent_ref=parent_ref,
                is_parent=chunk.is_parent,
                keywords=self._current_metadata[i].get("keywords", "") if i < len(self._current_metadata) else "",
                summary=self._current_metadata[i].get("summary", "") if i < len(self._current_metadata) else "",
            )
            self._producer.send(
                topic=self._config.kafka.embed_task_topic,
                key=msg.tenant_id,
                value=embed_msg.to_dict(),
            )

        self._producer.flush()
        logger.info(f"Published {len(chunks.chunks)} embed-task messages to Kafka")

    def _update_document_stage(self, msg: FileIngestMessage, status: str):
        session = get_session()
        try:
            params = {
                "tenant_id": msg.tenant_id,
                "doc_id": msg.doc_id,
                "version": msg.version,
                "status": status,
            }
            session.execute(
                text(
                    """
                    UPDATE kb_knowledge.knowledge_doc
                    SET status = :status
                    WHERE tenant_id = :tenant_id
                      AND doc_id = :doc_id
                      AND version = :version
                    """
                ),
                params,
            )
            session.execute(
                text(
                    """
                    UPDATE kb_knowledge.knowledge_version
                    SET status = :status
                    WHERE tenant_id = :tenant_id
                      AND doc_id = :doc_id
                      AND version = :version
                    """
                ),
                params,
            )
            session.commit()
            logger.info(
                "Document stage updated: docId=%s version=%s status=%s traceId=%s",
                msg.doc_id,
                msg.version,
                status,
                msg.trace_id,
            )
        except Exception:
            session.rollback()
            logger.exception(
                "Failed to update document stage: docId=%s version=%s status=%s traceId=%s",
                msg.doc_id,
                msg.version,
                status,
                msg.trace_id,
            )
            raise
        finally:
            session.close()

    def _mark_document_failed(self, msg: FileIngestMessage, exc: Exception):
        error_msg = str(exc)[:1000]
        session = get_session()
        try:
            params = {
                "tenant_id": msg.tenant_id,
                "doc_id": msg.doc_id,
                "version": msg.version,
            }
            session.execute(
                text(
                    """
                    UPDATE kb_knowledge.knowledge_doc
                    SET status = 'FAILED'
                    WHERE tenant_id = :tenant_id
                      AND doc_id = :doc_id
                      AND version = :version
                    """
                ),
                params,
            )
            session.execute(
                text(
                    """
                    UPDATE kb_knowledge.knowledge_version
                    SET status = 'FAILED'
                    WHERE tenant_id = :tenant_id
                      AND doc_id = :doc_id
                      AND version = :version
                    """
                ),
                params,
            )
            session.execute(
                text(
                    """
                    UPDATE kb_knowledge.embed_task
                    SET status = 'FAILED',
                        error_code = 'DOC_PROCESS_FAILED',
                        error_msg = :error_msg,
                        retry_count = retry_count + 1,
                        updated_at = now()
                    WHERE tenant_id = :tenant_id
                      AND doc_id = :doc_id
                      AND version = :version
                      AND status != 'DONE'
                    """
                ),
                {**params, "error_msg": error_msg},
            )
            session.commit()
            logger.error(
                "Marked document as FAILED: docId=%s version=%s traceId=%s error=%s",
                msg.doc_id,
                msg.version,
                msg.trace_id,
                error_msg,
            )
        except Exception:
            session.rollback()
            logger.exception(
                "Failed to mark document FAILED: docId=%s version=%s traceId=%s",
                msg.doc_id,
                msg.version,
                msg.trace_id,
            )
        finally:
            session.close()
