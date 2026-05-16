import logging
import os
import signal
import sys

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app import init_app
from src.config import load_config
from src.logging_config import setup_logging

logger = logging.getLogger(__name__)


def main():
    setup_logging(level=logging.INFO)

    config = load_config()
    init_app(config)

    app = FastAPI(title="kb-rerank-service", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors.allowed_origins.split(","),
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Trace-Id"],
    )

    from src.api import router
    app.include_router(router)

    def shutdown():
        logger.info("Rerank service shutting down...")

    signal.signal(signal.SIGINT, lambda s, f: (shutdown(), sys.exit(0)))
    signal.signal(signal.SIGTERM, lambda s, f: (shutdown(), sys.exit(0)))

    uvicorn.run(app, host="0.0.0.0", port=config.server.port, log_level="info")


if __name__ == "__main__":
    main()
