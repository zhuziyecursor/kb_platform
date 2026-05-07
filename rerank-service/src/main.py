import logging
import os
import signal
import sys

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app import init_app
from src.config import load_config

logger = logging.getLogger(__name__)


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    config = load_config()
    init_app(config)

    app = FastAPI(title="kb-rerank-service", version="0.1.0")
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
        logger.info("Rerank service shutting down...")

    signal.signal(signal.SIGINT, lambda s, f: (shutdown(), sys.exit(0)))
    signal.signal(signal.SIGTERM, lambda s, f: (shutdown(), sys.exit(0)))

    port = int(os.environ.get("RERANK_SERVICE_PORT", "31003"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()
