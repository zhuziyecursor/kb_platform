import hashlib
import logging
import re
import time
from datetime import datetime, timezone

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


class Pipeline:
    def __init__(self, config: AppConfig, producer: KafkaProducer):
        self._config = config
        self._producer = producer
        self._parser = TikaParser(config.tika, config.mvp_limits)
        self._cleaner = TextCleaner()
        self._minio = MinioClient(config.minio)
        self._embedding = EmbeddingClient(config.embedding)

    def process_message(self, msg: FileIngestMessage):
        logger.info(
            f"Pipeline start: docId={msg.doc_id}, version={msg.version}, "
            f"traceId={msg.trace_id}"
        )

        file_bytes = self._minio.get_object(msg.src_path)
        parse_result = self._parse(file_bytes, msg)
        clean_result = self._clean(parse_result, msg)
        chunks = self._chunk(clean_result, msg)
        vectors = self._embed(chunks)
        self._save_results(msg, parse_result, clean_result, chunks)
        self._publish_embed_tasks(msg, parse_result, chunks, vectors)

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

        if chunk_mode == "SMART_LLM":
            chunker = LLMChunker(
                config=self._config.intelligent_chunker,
                chunk_size=chunk_size,
                overlap_ratio=overlap_ratio,
            )
        elif chunk_mode == "SMART":
            chunker = SemanticChunker(
                chunk_size=chunk_size,
                overlap_ratio=overlap_ratio,
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

            structured_body = {
                "sections": [
                    {
                        "section_path": None,
                        "page": None,
                        "paragraphs": [{"text": c.text} for c in chunks.chunks],
                    }
                ],
                "traceId": msg.trace_id,
            }
            structured_record = KnowledgeStructured(
                tenant_id=msg.tenant_id,
                doc_id=msg.doc_id,
                version=msg.version,
                json_body=structured_body,
                extractor_ver="v1",
            )
            session.add(structured_record)

            now = datetime.now(timezone.utc)
            for chunk in chunks.chunks:
                text_hash = hashlib.sha256(chunk.text.encode("utf-8")).hexdigest()
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
                    tags=msg.label_tags,  # 一期直接用文档级标签；PHASE2: 合并章节/分片标签展平
                    chunk_type=Pipeline._infer_chunk_type(chunk.text),
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
        title = parse_result.metadata.get("title", "")
        for i, chunk in enumerate(chunks.chunks):
            text_hash = hashlib.sha256(chunk.text.encode("utf-8")).hexdigest()
            vector = vectors[i] if i < len(vectors) else None
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
            )
            self._producer.send(
                topic=self._config.kafka.embed_task_topic,
                key=msg.tenant_id,
                value=embed_msg.to_dict(),
            )

        self._producer.flush()
        logger.info(f"Published {len(chunks.chunks)} embed-task messages to Kafka")
