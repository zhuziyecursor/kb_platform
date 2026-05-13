from unittest.mock import MagicMock

from src.chunker import ChunkInfo, ChunkResult
from src.cleaner import CleanResult
from src.kafka_producer import FileIngestMessage
from src.parser import PageInfo, ParseResult
from src.pipeline import Pipeline


def _message() -> FileIngestMessage:
    return FileIngestMessage(
        trace_id="tr-test",
        tenant_id="tenant-1",
        doc_id="doc-1",
        version=1,
        src_path="tenant/file.pdf",
        sha256="a" * 64,
        sec_level=1,
    )


def test_process_message_marks_document_failed_when_pipeline_raises(monkeypatch):
    pipeline = object.__new__(Pipeline)
    pipeline._minio = MagicMock()
    pipeline._minio.get_object.side_effect = RuntimeError("minio unavailable")

    mark_failed = MagicMock()
    monkeypatch.setattr(pipeline, "_mark_document_failed", mark_failed)
    monkeypatch.setattr(pipeline, "_update_document_stage", MagicMock())

    msg = _message()
    try:
        pipeline.process_message(msg)
    except RuntimeError as exc:
        assert "minio unavailable" in str(exc)
    else:
        raise AssertionError("process_message should re-raise pipeline errors")

    mark_failed.assert_called_once()
    assert mark_failed.call_args.args[0] is msg


def test_process_message_updates_observable_stages(monkeypatch):
    pipeline = object.__new__(Pipeline)
    pipeline._minio = MagicMock()
    pipeline._minio.get_object.return_value = b"file-bytes"

    parse_result = ParseResult(pages=[PageInfo(page_num=1, text="parsed text")], metadata={})
    clean_result = CleanResult(cleaned_text="cleaned text", quality_score=100.0, issues=[])
    chunks = ChunkResult(chunks=[
        ChunkInfo(chunk_seq=0, text="cleaned text", char_count=12, token_count=8)
    ])

    monkeypatch.setattr(pipeline, "_parse", MagicMock(return_value=parse_result))
    monkeypatch.setattr(pipeline, "_clean", MagicMock(return_value=clean_result))
    monkeypatch.setattr(pipeline, "_chunk", MagicMock(return_value=chunks))
    monkeypatch.setattr(pipeline, "_extract_metadata", MagicMock())
    monkeypatch.setattr(pipeline, "_embed", MagicMock(return_value=[[0.1, 0.2]]))
    monkeypatch.setattr(pipeline, "_save_results", MagicMock())
    monkeypatch.setattr(pipeline, "_publish_embed_tasks", MagicMock())
    update_stage = MagicMock()
    monkeypatch.setattr(pipeline, "_update_document_stage", update_stage)

    msg = _message()
    pipeline.process_message(msg)

    assert [call.args[1] for call in update_stage.call_args_list] == [
        "PARSING",
        "CHUNKING",
        "EMBEDDING",
        "VECTOR_PENDING",
    ]
