import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel


class RerankerConfig(BaseModel):
    model_name: str = "BAAI/bge-reranker-v2-m3"
    max_length: int = 512
    batch_size: int = 20
    local_model_path: str = ""


class ServerConfig(BaseModel):
    port: int = 31003


class CorsConfig(BaseModel):
    allowed_origins: str = "http://localhost:3105,http://localhost:3106"


class AppConfig(BaseModel):
    reranker: RerankerConfig = RerankerConfig()
    server: ServerConfig = ServerConfig()
    cors: CorsConfig = CorsConfig()


def _resolve_env_vars(obj, _path=()):
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = _resolve_env_vars(v, _path + (str(k),))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = _resolve_env_vars(v, _path + (str(i),))
    elif isinstance(obj, str) and obj.startswith("${") and obj.endswith("}"):
        env_var = obj[2:-1]
        # Handle default value syntax: ${ENV_VAR:default}
        if ":" in env_var:
            env_name, default = env_var.split(":", 1)
            return os.environ.get(env_name, default)
        return os.environ.get(env_var, "")
    return obj


def load_config(config_path: Optional[str] = None) -> AppConfig:
    if config_path is None:
        config_path = os.environ.get(
            "KB_RERANK_SERVICE_CONFIG",
            str(Path(__file__).parent.parent / "config" / "settings.yaml"),
        )

    with open(config_path) as f:
        raw = yaml.safe_load(f)

    _resolve_env_vars(raw)

    service_cfg = raw.get("kb_rerank_service", {})
    return AppConfig(
        reranker=RerankerConfig(**service_cfg.get("reranker", {})),
        server=ServerConfig(**service_cfg.get("server", {})),
        cors=CorsConfig(**service_cfg.get("cors", {})),
    )
