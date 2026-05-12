import json
import logging
import time
import threading
from typing import Callable

from confluent_kafka import Consumer, KafkaError, KafkaException, Message

from src.kafka_producer import FileIngestMessage

logger = logging.getLogger(__name__)

_PERMANENT_ERRORS = (
    "NoSuchKey",
    "UniqueViolation",
    "duplicate key value violates unique constraint",
    "Expecting value",          # JSON 解析失败 — 消息体为空/损坏，重试无意义
    "JSONDecodeError",          # 消息体格式错误
)

_IDLE_WARNING_INTERVAL = 120   # consumer 持续无消息时的 WARNING 间隔
_UNHEALTHY_POLL_GAP = 90       # 超过此秒数未 poll 判定为不健康


class KafkaConsumer:
    def __init__(self, config: dict, topic: str, handler: Callable[[FileIngestMessage], None]):
        self._topic = topic
        self._handler = handler
        self._consumer = Consumer(config)
        self._running = False
        self._thread: threading.Thread | None = None
        self._last_poll_at: float = 0.0
        self._last_error_at: float = 0.0
        self._last_idle_warning_at: float = 0.0
        self._consecutive_timeouts: int = 0

    def is_healthy(self) -> bool:
        if not self._running:
            return False
        if self._last_poll_at == 0.0:
            return True  # 刚启动，还没到 polling 周期
        return (time.monotonic() - self._last_poll_at) < _UNHEALTHY_POLL_GAP

    def get_stats(self) -> dict:
        now = time.monotonic()
        seconds_since_poll = now - self._last_poll_at if self._last_poll_at else None
        return {
            "consumer": {
                "running": self._running,
                "topic": self._topic,
                "healthy": self.is_healthy(),
                "seconds_since_last_poll": round(seconds_since_poll, 1) if seconds_since_poll else None,
                "consecutive_timeouts": self._consecutive_timeouts,
            }
        }

    def start(self):
        self._running = True
        self._consumer.subscribe([self._topic])
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info(f"KafkaConsumer started, listening on topic: {self._topic}")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=30)
        self._consumer.close()
        logger.info("KafkaConsumer stopped")

    def _poll_loop(self):
        while self._running:
            try:
                msg = self._consumer.poll(timeout=1.0)
                if msg is None:
                    self._track_idle()
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        self._last_poll_at = time.monotonic()
                        continue
                    logger.error(f"Kafka error: {msg.error()}")
                    self._last_error_at = time.monotonic()
                    self._consecutive_timeouts += 1
                    continue

                self._last_poll_at = time.monotonic()
                self._consecutive_timeouts = 0
                self._process_message(msg.value(), msg)
            except KafkaException as e:
                self._last_error_at = time.monotonic()
                self._consecutive_timeouts += 1
                logger.error(f"Kafka exception in poll loop: {e}")
            except Exception as e:
                self._last_error_at = time.monotonic()
                self._consecutive_timeouts += 1
                logger.exception(f"Unexpected error in poll loop: {e}")

    def _track_idle(self):
        now = time.monotonic()
        if self._last_idle_warning_at == 0.0:
            self._last_idle_warning_at = now
            return
        if now - self._last_idle_warning_at >= _IDLE_WARNING_INTERVAL:
            self._last_idle_warning_at = now
            gap = now - self._last_poll_at if self._last_poll_at else -1
            logger.warning(
                "KafkaConsumer idle: no message consumed for %d seconds, healthy=%s",
                int(gap) if gap > 0 else 0,
                self.is_healthy(),
            )

    def _process_message(self, raw_value: bytes, msg: Message):
        try:
            data = json.loads(raw_value.decode("utf-8"))
            message = FileIngestMessage.from_dict(data)
            logger.info(
                f"Received file-ingest message: traceId={message.trace_id}, "
                f"docId={message.doc_id}, version={message.version}"
            )
            self._handler(message)
            self._consumer.commit(message=msg)
            logger.info(f"Committed offset: docId={message.doc_id}")
        except Exception as e:
            err_str = str(e)
            is_permanent = any(keyword in err_str for keyword in _PERMANENT_ERRORS)
            if is_permanent:
                logger.warning(f"Permanent error — committing offset anyway: {err_str[:200]}")
                self._consumer.commit(message=msg)
            else:
                logger.exception(f"Transient error — offset NOT committed: {err_str[:200]}")
