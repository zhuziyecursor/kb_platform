import logging
import traceback
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from src.app import get_config
from src.cleaner.text_cleaner import TextCleaner
from src.chunker.fixed_length_chunker import FixedLengthChunker
from src.parser.tika_parser import TikaParser
from src.pipeline import Pipeline
from src.kafka_producer import KafkaProducer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")


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

    chunk_type = request.get("chunkType", "fixed_length")
    if chunk_type == "semantic":
        raise HTTPException(
            status_code=501,
            detail={
                "code": "PHASE2_FEATURE",
                "message": "SemanticChunker 为 PHASE2 功能，MVP 一期不可用。请使用 chunkType=fixed_length",
                "traceId": trace_id,
            },
        )

    chunker = FixedLengthChunker(
        chunk_size=config.chunk_defaults.chunk_size,
        overlap_ratio=config.chunk_defaults.overlap_ratio,
        mode=config.chunk_defaults.chunk_mode,
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
            }
            for c in result.chunks
        ],
        "totalChunks": result.total_chunks,
        "traceId": trace_id,
    }


@router.post("/process")
async def process_file(
    file: UploadFile = File(...),
    chunk_type: str = Form(default="fixed_length"),
):
    config = get_config()
    trace_id = _make_trace_id()

    if chunk_type == "semantic":
        raise HTTPException(
            status_code=501,
            detail={
                "code": "PHASE2_FEATURE",
                "message": "SemanticChunker 为 PHASE2 功能，MVP 一期不可用。",
                "traceId": trace_id,
            },
        )

    file_bytes = await file.read()
    _check_file_size(file_bytes, config.mvp_limits.max_file_size_mb)

    try:
        parser = TikaParser(config.tika, config.mvp_limits)
        parse_result = parser.parse(file_bytes)
        parse_result.trace_id = trace_id

        cleaner = TextCleaner()
        clean_result = cleaner.clean(parse_result.full_text)
        clean_result.trace_id = trace_id

        chunker = FixedLengthChunker(
            chunk_size=config.chunk_defaults.chunk_size,
            overlap_ratio=config.chunk_defaults.overlap_ratio,
            mode=config.chunk_defaults.chunk_mode,
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
