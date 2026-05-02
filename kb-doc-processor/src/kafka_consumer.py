import json
import logging
import threading
from typing import Callable

from confluent_kafka import Consumer, KafkaError, KafkaException, Message

from src.kafka_producer import FileIngestMessage

logger = logging.getLogger(__name__)

_PERMANENT_ERRORS = (
    "NoSuchKey",
    "UniqueViolation",
    "duplicate key value violates unique constraint",
)


class KafkaConsumer:
    def __init__(self, config: dict, topic: str, handler: Callable[[FileIngestMessage], None]):
        self._topic = topic
        self._handler = handler
        self._consumer = Consumer(config)
        self._running = False
        self._thread: threading.Thread | None = None

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
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    logger.error(f"Kafka error: {msg.error()}")
                    continue

                self._process_message(msg.value(), msg)
            except KafkaException as e:
                logger.error(f"Kafka exception in poll loop: {e}")
            except Exception as e:
                logger.exception(f"Unexpected error in poll loop: {e}")

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
