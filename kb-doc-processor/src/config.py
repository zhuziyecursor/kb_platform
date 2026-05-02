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


class ChunkDefaults(BaseModel):
    chunk_size: int = 512
    overlap_ratio: int = 10
    chunk_mode: str = "HEAD_FIRST"


class EmbeddingConfig(BaseModel):
    url: str = "http://192.168.30.47:31296/embeddings"
    timeout_seconds: int = 60
    max_retries: int = 3
    model_name: str = "BGE-zh-v1.5"
    dim: int = 1024


class RetryConfig(BaseModel):
    max_retries: int = 3
    backoff_base_seconds: int = 5


class AppConfig(BaseModel):
    tika: TikaConfig = TikaConfig()
    minio: MinioConfig = MinioConfig()
    kafka: KafkaConfig = KafkaConfig()
    database: DatabaseConfig = DatabaseConfig()
    mvp_limits: MvpLimits = MvpLimits()
    chunk_defaults: ChunkDefaults = ChunkDefaults()
    embedding: EmbeddingConfig = EmbeddingConfig()
    retry: RetryConfig = RetryConfig()


def load_config(config_path: Optional[str] = None) -> AppConfig:
    if config_path is None:
        config_path = os.environ.get(
            "KB_PROCESSOR_CONFIG",
            str(Path(__file__).parent.parent / "config" / "settings.yaml"),
        )

    with open(config_path) as f:
        raw = yaml.safe_load(f)

    processor_cfg = raw.get("kb_document_processor", {})

    return AppConfig(
        tika=TikaConfig(**processor_cfg.get("tika", {})),
        minio=MinioConfig(**processor_cfg.get("minio", {})),
        kafka=KafkaConfig(**processor_cfg.get("kafka", {})),
        database=DatabaseConfig(**processor_cfg.get("database", {})),
        mvp_limits=MvpLimits(**processor_cfg.get("mvp_limits", {})),
        chunk_defaults=ChunkDefaults(**processor_cfg.get("chunk_defaults", {})),
        embedding=EmbeddingConfig(**processor_cfg.get("embedding", {})),
        retry=RetryConfig(**processor_cfg.get("retry", {})),
    )
