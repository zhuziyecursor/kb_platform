from __future__ import annotations

from src.config import AppConfig
from src.db import session as db_session
from src.db.models import Base

_app_config: AppConfig | None = None


def init_app(config: AppConfig):
    global _app_config
    _app_config = config
    db_session.init_db(config)
    Base.metadata.create_all(db_session.engine)


def get_config() -> AppConfig:
    if _app_config is None:
        raise RuntimeError("App not initialized. Call init_app() first.")
    return _app_config
