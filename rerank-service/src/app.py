from __future__ import annotations

from src.config import AppConfig

_app_config: AppConfig | None = None


def init_app(config: AppConfig):
    global _app_config
    _app_config = config


def get_config() -> AppConfig:
    if _app_config is None:
        raise RuntimeError("App not initialized. Call init_app() first.")
    return _app_config
