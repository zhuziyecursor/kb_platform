import logging
import signal
import sys

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app import init_app, get_config
from src.config import load_config
from src.kafka_consumer import KafkaConsumer
from src.kafka_producer import KafkaProducer
from src.pipeline import Pipeline

logger = logging.getLogger(__name__)


def _create_kafka_producer(config) -> KafkaProducer:
    return KafkaProducer({
        "bootstrap.servers": config.kafka.bootstrap_servers,
        "acks": "all",
        "retries": 3,
        "compression.type": "gzip",
    })


def _create_kafka_consumer(config, pipeline: Pipeline) -> KafkaConsumer:
    return KafkaConsumer(
        config={
            "bootstrap.servers": config.kafka.bootstrap_servers,
            "group.id": config.kafka.consumer_group,
            "auto.offset.reset": config.kafka.auto_offset_reset,
            "enable.auto.commit": config.kafka.enable_auto_commit,
        },
        topic=config.kafka.file_ingest_topic,
        handler=pipeline.process_message,
    )


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    config = load_config()
    init_app(config)

    producer = _create_kafka_producer(config)
    pipeline = Pipeline(config, producer)
    consumer = _create_kafka_consumer(config, pipeline)

    consumer.start()

    app = FastAPI(title="kb-doc-processor", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3105", "http://localhost:3106"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    from src.api import router
    app.include_router(router)

    def shutdown():
        logger.info("Shutting down...")
        consumer.stop()
        producer.close()

    signal.signal(signal.SIGINT, lambda s, f: (shutdown(), sys.exit(0)))
    signal.signal(signal.SIGTERM, lambda s, f: (shutdown(), sys.exit(0)))

    uvicorn.run(app, host="0.0.0.0", port=31001, log_level="info")


if __name__ == "__main__":
    main()
