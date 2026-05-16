import logging
import sys
import threading
import pytest

from src.logging_config import (
    setup_logging,
    set_trace_context,
    clear_trace_context,
    SERVICE_NAME,
)


class TestSetTraceContext:
    """set_trace_context / clear_trace_context thread-local context."""

    def test_set_trace_context_stores_values(self):
        set_trace_context(trace_id="tr-123", span="bm25_search", event_type="trace")
        from src.logging_config import _local
        assert _local.trace_id == "tr-123"
        assert _local.span == "bm25_search"
        assert _local.event_type == "trace"

    def test_set_trace_context_empty_defaults(self):
        set_trace_context()
        from src.logging_config import _local
        assert _local.trace_id == ""
        assert _local.span == ""
        assert _local.event_type == "trace"  # default param value

    def test_set_trace_context_none_defaults(self):
        set_trace_context(trace_id=None, span=None, event_type=None)
        from src.logging_config import _local
        assert _local.trace_id == ""
        assert _local.span == ""
        assert _local.event_type == "app"

    def test_clear_trace_context_resets(self):
        set_trace_context(trace_id="tr-reset", span="test", event_type="trace")
        clear_trace_context()
        from src.logging_config import _local
        assert _local.trace_id == ""
        assert _local.span == ""
        assert _local.event_type == "app"

    def test_thread_isolation(self):
        """Verify each thread has independent trace context."""
        results = []

        def worker(tid, span_name):
            set_trace_context(trace_id=tid, span=span_name)
            from src.logging_config import _local
            results.append((_local.trace_id, _local.span))

        t1 = threading.Thread(target=worker, args=("tr-aaa", "span_a"))
        t2 = threading.Thread(target=worker, args=("tr-bbb", "span_b"))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert ("tr-aaa", "span_a") in results
        assert ("tr-bbb", "span_b") in results


class TestSetupLogging:
    """setup_logging configuration."""

    def setup_method(self):
        # Reset root logger before each test
        root = logging.getLogger()
        root.handlers.clear()

    def test_creates_console_handler(self):
        setup_logging(level=logging.INFO)
        root = logging.getLogger()
        console_handlers = [
            h for h in root.handlers
            if isinstance(h, logging.StreamHandler) and h.stream == sys.stdout
        ]
        assert len(console_handlers) == 1

    def test_console_formatter_is_plain_text(self):
        setup_logging(level=logging.INFO)
        root = logging.getLogger()
        console = [h for h in root.handlers
                   if isinstance(h, logging.StreamHandler) and h.stream == sys.stdout][0]
        fmt = console.formatter._fmt
        assert fmt == "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        # NOT JSON — console stays human-readable
        assert "{" not in fmt

    def test_creates_json_file_handler_when_package_available(self):
        setup_logging(level=logging.INFO)
        root = logging.getLogger()
        file_handlers = [
            h for h in root.handlers
            if isinstance(h, logging.handlers.TimedRotatingFileHandler)
        ]
        assert len(file_handlers) == 1

    def test_level_is_respected(self):
        setup_logging(level=logging.WARNING)
        root = logging.getLogger()
        assert root.level == logging.WARNING

    def test_record_factory_injects_service_name(self):
        setup_logging(level=logging.INFO)
        record = logging.getLogRecordFactory()(
            "test", logging.INFO, "test.py", 1, "hello", (), None
        )
        assert record.service == SERVICE_NAME

    def test_record_factory_injects_trace_id_from_local(self):
        set_trace_context(trace_id="tr-ctx-99")
        setup_logging(level=logging.INFO)
        record = logging.getLogRecordFactory()(
            "test", logging.INFO, "test.py", 1, "hello", (), None
        )
        assert record.trace_id == "tr-ctx-99"

    def test_record_factory_injects_span_from_local(self):
        set_trace_context(span="chunk_split")
        setup_logging(level=logging.INFO)
        record = logging.getLogRecordFactory()(
            "test", logging.INFO, "test.py", 1, "hello", (), None
        )
        assert record.span == "chunk_split"

    def test_record_factory_defaults_when_no_context(self):
        clear_trace_context()  # ensure clean state; previous test may have set thread-local values
        setup_logging(level=logging.INFO)
        record = logging.getLogRecordFactory()(
            "test", logging.INFO, "test.py", 1, "hello", (), None
        )
        assert record.trace_id == ""
        assert record.span == ""
        assert record.event_type == "app"

    def test_record_factory_survives_missing_local_attrs(self):
        """record_factory must not throw even if _local has no attributes set."""
        from src.logging_config import _local
        # Simulate a fresh thread without any attributes
        saved = {}
        for attr in ["trace_id", "span", "event_type", "service"]:
            try:
                saved[attr] = getattr(_local, attr)
                delattr(_local, attr)
            except (AttributeError, KeyError):
                pass

        try:
            setup_logging(level=logging.INFO)
            record = logging.getLogRecordFactory()(
                "test", logging.INFO, "test.py", 1, "hello", (), None
            )
            assert record.service == SERVICE_NAME
            assert record.trace_id == ""
        finally:
            for attr, val in saved.items():
                setattr(_local, attr, val)


class TestLogOutput:
    """End-to-end: a log message reaches the JSON handler and formats correctly."""

    def setup_method(self):
        root = logging.getLogger()
        root.handlers.clear()
        clear_trace_context()

    def test_json_handler_emits_valid_json(self):
        import json
        import io

        setup_logging(level=logging.INFO)

        # Replace JSON handler's stream with in-memory buffer
        json_handlers = [
            h for h in logging.getLogger().handlers
            if isinstance(h, logging.handlers.TimedRotatingFileHandler)
        ]
        if not json_handlers:
            pytest.skip("python-json-logger not installed")
        json_handler = json_handlers[0]
        buf = io.StringIO()
        json_handler.stream = buf

        set_trace_context(trace_id="tr-e2e", span="rerank", event_type="trace")
        logger = logging.getLogger("test.module")
        logger.info("Rerank completed, results=5")

        json_handler.flush()
        output = buf.getvalue().strip()
        assert output, "JSON handler should have emitted a log line"

        parsed = json.loads(output)
        assert parsed["message"] == "Rerank completed, results=5"
        assert parsed["levelname"] == "INFO"
        assert parsed["name"] == "test.module"
        assert parsed["service"] == SERVICE_NAME
        assert parsed["trace_id"] == "tr-e2e"
        assert parsed["span"] == "rerank"
        assert parsed["event_type"] == "trace"

    def test_console_output_is_not_json(self):
        import io

        setup_logging(level=logging.INFO)
        console = [h for h in logging.getLogger().handlers
                   if isinstance(h, logging.StreamHandler) and h.stream == sys.stdout][0]
        buf = io.StringIO()
        console.stream = buf  # temporary override

        logging.getLogger("test").info("Plain log message")
        output = buf.getvalue().strip()
        console.stream = sys.stdout  # restore

        assert "Plain log message" in output
        assert not output.startswith("{"), "Console should be plain text, not JSON"
