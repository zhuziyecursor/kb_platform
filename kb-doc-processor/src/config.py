import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field


class TikaConfig(BaseModel):
    server_uri: str = "http://localhost:29998"
    timeout_seconds: int = 120


class MinioConfig(BaseModel):
    endpoint: str = "localhost:29000"
    access_key: str = "kb_minio_admin"
    secret_key: str = "kb_minio_dev_2026"
    bucket: str = "kb-raw"
    secure: bool = False


class KafkaConfig(BaseModel):
    bootstrap_servers: str = "localhost:9092"
    consumer_group: str = "kb-doc-processor"
    file_ingest_topic: str = "file-ingest"
    embed_task_topic: str = "embed-task"
    auto_offset_reset: str = "earliest"
    enable_auto_commit: bool = False
    session_timeout_ms: int = 60000
    heartbeat_interval_ms: int = 20000
    max_poll_interval_ms: int = 600000
    socket_timeout_ms: int = 30000
    metadata_max_age_ms: int = 300000


class DatabaseConfig(BaseModel):
    model_config = {"populate_by_name": True}

    host: str = "localhost"
    port: int = 25432
    name: str = "kb_knowledge"
    username: str = "kb_processor"
    password: str = "kb_processor"
    db_schema: str = Field(default="kb_knowledge", alias="schema")

    @property
    def url(self) -> str:
        return f"postgresql://{self.username}:{self.password}@{self.host}:{self.port}/{self.name}"


class MvpLimits(BaseModel):
    max_file_size_mb: int = 5
    max_file_pages: int = 30
    ocr_disabled: bool = True


class SmartChunkConfig(BaseModel):
    parent_max_size: int = 1500
    child_size: int = 400
    child_overlap: int = 50


class ChunkDefaults(BaseModel):
    chunk_size: int = 512
    overlap_ratio: int = 10
    chunk_mode: str = "SMART"
    smart: SmartChunkConfig = SmartChunkConfig()


class EmbeddingConfig(BaseModel):
    # url: str = "http://192.168.30.47:31296/embeddings"
    url: str = "http://193.134.211.121:31296/embeddings"
    timeout_seconds: int = 60
    max_retries: int = 3
    model_name: str = "BGE-zh-v1.5"
    dim: int = 1024


class IntelligentChunkerConfig(BaseModel):
    enabled: bool = True
    api_base: str = "https://api.minimax.chat/v1/text/chatcompletion_v2"
    api_key: str = ""
    model: str = "abab6.5s-chat"
    temperature: float = 0.0
    max_tokens: int = 4096
    timeout_seconds: int = 30
    max_retries: int = 2
    batch_paragraphs: int = 80
    batch_overlap: int = 10


class RetryConfig(BaseModel):
    max_retries: int = 3
    backoff_base_seconds: int = 5


class MetadataExtractorConfig(BaseModel):
    keyword_top_n: int = 5
    summary_max_chars: int = 200
    short_text_threshold: int = 100
    allow_pos: tuple = ("n", "vn", "vd", "nt", "nz", "v", "ns", "nr")
    custom_dict_path: str = "src/utils/custom_dict.txt"


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 31001


class CorsConfig(BaseModel):
    allowed_origins: str = "http://localhost:3105,http://localhost:3106"


class AppConfig(BaseModel):
    tika: TikaConfig = TikaConfig()
    minio: MinioConfig = MinioConfig()
    kafka: KafkaConfig = KafkaConfig()
    database: DatabaseConfig = DatabaseConfig()
    mvp_limits: MvpLimits = MvpLimits()
    chunk_defaults: ChunkDefaults = ChunkDefaults()
    embedding: EmbeddingConfig = EmbeddingConfig()
    retry: RetryConfig = RetryConfig()
    intelligent_chunker: IntelligentChunkerConfig = IntelligentChunkerConfig()
    metadata_extractor: MetadataExtractorConfig = MetadataExtractorConfig()
    server: ServerConfig = ServerConfig()
    cors: CorsConfig = CorsConfig()


def _resolve_env_vars(obj, _path=()):
    """Recursively resolve ${ENV_VAR} or ${ENV_VAR:default} placeholders in dict/list config values."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = _resolve_env_vars(v, _path + (str(k),))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = _resolve_env_vars(v, _path + (str(i),))
    elif isinstance(obj, str) and obj.startswith('${') and obj.endswith('}'):
        env_var = obj[2:-1]
        # Handle default value syntax: ${ENV_VAR:default}
        if ":" in env_var:
            env_name, default = env_var.split(":", 1)
            return os.environ.get(env_name, default)
        return os.environ.get(env_var, '')
    return obj


def load_config(config_path: Optional[str] = None) -> AppConfig:
    if config_path is None:
        config_path = os.environ.get(
            "KB_PROCESSOR_CONFIG",
            str(Path(__file__).parent.parent / "config" / "settings.yaml"),
        )

    with open(config_path) as f:
        raw = yaml.safe_load(f)

    # Resolve ${ENV_VAR:default} placeholders in the raw config
    _resolve_env_vars(raw)

    processor_cfg = raw.get("kb_document_processor", {})

    chunk_defaults_raw = processor_cfg.get("chunk_defaults", {})
    smart_raw = chunk_defaults_raw.pop("smart", {})

    return AppConfig(
        tika=TikaConfig(**processor_cfg.get("tika", {})),
        minio=MinioConfig(**processor_cfg.get("minio", {})),
        kafka=KafkaConfig(**processor_cfg.get("kafka", {})),
        database=DatabaseConfig(**processor_cfg.get("database", {})),
        mvp_limits=MvpLimits(**processor_cfg.get("mvp_limits", {})),
        chunk_defaults=ChunkDefaults(
            **chunk_defaults_raw,
            smart=SmartChunkConfig(**smart_raw),
        ),
        embedding=EmbeddingConfig(**processor_cfg.get("embedding", {})),
        retry=RetryConfig(**processor_cfg.get("retry", {})),
        intelligent_chunker=IntelligentChunkerConfig(**processor_cfg.get("intelligent_chunker", {})),
        metadata_extractor=MetadataExtractorConfig(**processor_cfg.get("metadata_extractor", {})),
        server=ServerConfig(**processor_cfg.get("server", {})),
        cors=CorsConfig(**processor_cfg.get("cors", {})),
    )
