import logging
import logging.handlers
import os
import sys
import threading

SERVICE_NAME = "rerank-service"

_local = threading.local()


def set_trace_context(trace_id: str = "", span: str = "", event_type: str = "trace"):
    """Set trace context for the current thread. Safe to call multiple times."""
    try:
        _local.trace_id = trace_id or ""
        _local.span = span or ""
        _local.event_type = event_type or "app"
    except Exception:
        pass


def clear_trace_context():
    """Clear trace context for the current thread."""
    try:
        _local.trace_id = ""
        _local.span = ""
        _local.event_type = "app"
    except Exception:
        pass


_old_factory = logging.getLogRecordFactory()


def _record_factory(*args, **kwargs):
    record = _old_factory(*args, **kwargs)
    try:
        record.service = getattr(_local, "service", SERVICE_NAME)
        record.trace_id = getattr(_local, "trace_id", "")
        record.event_type = getattr(_local, "event_type", "app")
        record.span = getattr(_local, "span", "")
    except Exception:
        record.service = SERVICE_NAME
        record.trace_id = ""
        record.event_type = "app"
        record.span = ""
    return record


def setup_logging(level: int = logging.INFO):
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    # Console: keep the exact same plain-text format as before
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    ))
    console_handler.setLevel(level)
    root.addHandler(console_handler)

    # File JSON: for Promtail → Loki
    try:
        from pythonjsonlogger import jsonlogger

        log_dir = os.environ.get("RERANK_LOG_DIR", "logs")
        os.makedirs(log_dir, exist_ok=True)
        json_file = os.path.join(log_dir, "rerank-service.json")

        json_handler = logging.handlers.TimedRotatingFileHandler(
            json_file, when="midnight", backupCount=7, encoding="utf-8"
        )
        json_handler.setFormatter(jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
            json_ensure_ascii=False,
        ))
        json_handler.setLevel(level)
        root.addHandler(json_handler)
    except Exception:
        pass

    logging.setLogRecordFactory(_record_factory)
