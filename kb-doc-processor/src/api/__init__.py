import logging
import traceback
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from src.app import get_config
from src.cleaner.text_cleaner import TextCleaner
from src.chunker.fixed_length_chunker import FixedLengthChunker
from src.chunker.semantic_chunker import SemanticChunker
from src.chunker.llm_chunker import LLMChunker
from src.db.models import EmbedTask, KnowledgeClean, KnowledgeStructured
from src.db.session import get_session
from src.parser.tika_parser import TikaParser
from src.pipeline import Pipeline
from src.kafka_producer import KafkaProducer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")


@router.get("/health")
async def health(request: Request):
    consumer = request.app.state.kafka_consumer
    return consumer.get_stats()


def _make_trace_id() -> str:
    import uuid
    return f"tr-{uuid.uuid4()}"


@router.post("/parse")
async def parse_file(
    file: UploadFile = File(...),
    parse_method: str = Form(default="TIKA"),
    lang_hints: Optional[str] = Form(default=None),
):
    config = get_config()
    trace_id = _make_trace_id()

    if parse_method == "OCR":
        raise HTTPException(
            status_code=501,
            detail={
                "code": "PHASE2_FEATURE",
                "message": "OCRParser 为 PHASE2 功能，MVP 一期不可用。请使用 parse_method=TIKA",
                "traceId": trace_id,
            },
        )

    file_bytes = await file.read()
    _check_file_size(file_bytes, config.mvp_limits.max_file_size_mb)

    hints = lang_hints.split(",") if lang_hints else None
    try:
        parser = TikaParser(config.tika, config.mvp_limits)
        result = parser.parse(file_bytes, hints)
        result.trace_id = trace_id
        return {
            "docId": None,
            "pages": [
                {"pageNum": p.page_num, "text": p.text, "width": p.width, "height": p.height}
                for p in result.pages
            ],
            "metadata": result.metadata,
            "traceId": trace_id,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": str(e), "traceId": trace_id})
    except Exception as e:
        logger.exception("Parse failed")
        raise HTTPException(status_code=500, detail={"code": "PARSE_ERROR", "message": str(e), "traceId": trace_id})


@router.post("/clean")
async def clean_text(request: dict):
    config = get_config()
    trace_id = _make_trace_id()

    text = request.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "text is required", "traceId": trace_id})

    cleaner = TextCleaner()
    result = cleaner.clean(text, request.get("metadata"))
    result.trace_id = trace_id
    return {
        "cleanedText": result.cleaned_text,
        "qualityScore": result.quality_score,
        "issues": result.issues,
        "traceId": trace_id,
    }


@router.post("/chunk")
async def chunk_text(request: dict):
    config = get_config()
    trace_id = _make_trace_id()

    text = request.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "text is required", "traceId": trace_id})

    chunk_mode = request.get("chunkType", request.get("chunkMode", config.chunk_defaults.chunk_mode))
    chunk_size = request.get("chunkSize", config.chunk_defaults.chunk_size)
    overlap_ratio = request.get("overlapRatio", config.chunk_defaults.overlap_ratio)
    smart_cfg = config.chunk_defaults.smart
    parent_max_size = request.get("parentMaxSize", smart_cfg.parent_max_size)
    child_size = request.get("childSize", smart_cfg.child_size)
    child_overlap = request.get("childOverlap", smart_cfg.child_overlap)

    if chunk_mode == "SMART_LLM":
        chunker = LLMChunker(
            config=config.intelligent_chunker,
            chunk_size=chunk_size,
            overlap_ratio=overlap_ratio,
            smart_config=smart_cfg,
        )
    elif chunk_mode == "SMART":
        chunker = SemanticChunker(
            chunk_size=chunk_size,
            overlap_ratio=overlap_ratio,
            parent_max_size=parent_max_size,
            child_size=child_size,
            child_overlap=child_overlap,
        )
    else:
        chunker = FixedLengthChunker(
            chunk_size=chunk_size,
            overlap_ratio=overlap_ratio,
            mode=chunk_mode,
        )
    result = chunker.chunk(text, request.get("metadata"))
    result.trace_id = trace_id
    return {
        "chunks": [
            {
                "chunkSeq": c.chunk_seq,
                "text": c.text,
                "sectionPath": c.section_path,
                "page": c.page,
                "charCount": c.char_count,
                "tokenCount": c.token_count,
                "isParent": c.is_parent,
                "parentRef": c.parent_ref,
            }
            for c in result.chunks
        ],
        "totalChunks": result.total_chunks,
        "traceId": trace_id,
    }


@router.get("/docs/{doc_id}/chunks")
async def get_doc_chunks(doc_id: str, version: int = 1):
    config = get_config()
    trace_id = _make_trace_id()

    session = get_session()
    try:
        clean = (
            session.query(KnowledgeClean)
            .filter(KnowledgeClean.doc_id == doc_id)
            .order_by(KnowledgeClean.created_time.desc())
            .first()
        )
        if not clean:
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": f"Document {doc_id} not found", "traceId": trace_id},
            )

        cleaned_text = clean.cleaned_text

        structured = (
            session.query(KnowledgeStructured)
            .filter(KnowledgeStructured.doc_id == doc_id, KnowledgeStructured.version == version)
            .first()
        )

        if not structured:
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": f"No structured data for doc {doc_id} v{version}", "traceId": trace_id},
            )

        embed_tasks = (
            session.query(EmbedTask)
            .filter(EmbedTask.doc_id == doc_id, EmbedTask.version == version)
            .order_by(EmbedTask.chunk_seq)
            .all()
        )

        chunk_texts: list[str] = []
        for section in structured.json_body.get("sections", []):
            for para in section.get("paragraphs", []):
                chunk_texts.append(para["text"])

        chunks = []
        search_from = 0
        for i, text in enumerate(chunk_texts):
            pos = cleaned_text.find(text, search_from)
            if pos == -1:
                pos = search_from
            char_start = pos
            char_end = pos + len(text)
            search_from = char_end

            et = embed_tasks[i] if i < len(embed_tasks) else None
            chunks.append({
                "chunkSeq": i,
                "text": text,
                "charCount": len(text),
                "charStart": char_start,
                "charEnd": char_end,
                "sectionPath": et.section_path if et else None,
                "status": et.status if et else "UNKNOWN",
            })

        return {
            "docId": doc_id,
            "version": version,
            "totalChunks": len(chunks),
            "cleanedText": cleaned_text,
            "chunks": chunks,
            "traceId": trace_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get doc chunks")
        raise HTTPException(
            status_code=500,
            detail={"code": "DB_ERROR", "message": str(e), "traceId": trace_id},
        )
    finally:
        session.close()


@router.post("/process")
async def process_file(
    file: UploadFile = File(...),
    chunk_type: str = Form(default="fixed_length"),
):
    config = get_config()
    trace_id = _make_trace_id()

    chunk_mode = chunk_type
    chunk_size = config.chunk_defaults.chunk_size
    overlap_ratio = config.chunk_defaults.overlap_ratio
    smart_cfg = config.chunk_defaults.smart

    file_bytes = await file.read()
    _check_file_size(file_bytes, config.mvp_limits.max_file_size_mb)

    try:
        parser = TikaParser(config.tika, config.mvp_limits)
        parse_result = parser.parse(file_bytes)
        parse_result.trace_id = trace_id

        cleaner = TextCleaner()
        clean_result = cleaner.clean(parse_result.full_text)
        clean_result.trace_id = trace_id

        if chunk_mode == "SMART_LLM":
            chunker = LLMChunker(
                config=config.intelligent_chunker,
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

        chunk_result = chunker.chunk(clean_result.cleaned_text)
        chunk_result.trace_id = trace_id

        return {
            "docId": None,
            "chunks": [
                {
                    "chunkSeq": c.chunk_seq,
                    "text": c.text,
                    "sectionPath": c.section_path,
                    "page": c.page,
                    "charCount": c.char_count,
                    "tokenCount": c.token_count,
                    "isParent": c.is_parent,
                    "parentRef": c.parent_ref,
                }
                for c in chunk_result.chunks
            ],
            "totalChunks": chunk_result.total_chunks,
            "qualityScore": clean_result.quality_score,
            "traceId": trace_id,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": str(e), "traceId": trace_id})
    except Exception as e:
        logger.exception("Process failed")
        raise HTTPException(status_code=500, detail={"code": "PROCESS_ERROR", "message": str(e), "traceId": trace_id})


def _check_file_size(file_bytes: bytes, max_mb: int):
    max_bytes = max_mb * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise ValueError(f"File size ({len(file_bytes)} bytes) exceeds MVP limit ({max_mb}MB)")
