from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, CHAR, Date, DateTime, Float, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class KnowledgeClean(Base):
    __tablename__ = "knowledge_clean"
    __table_args__ = (
        UniqueConstraint("tenant_id", "doc_id", "sha256", name="uk_clean_tenant_doc_hash"),
        {"schema": "kb_knowledge"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    doc_id: Mapped[str] = mapped_column(String(128), nullable=False)
    src_path: Mapped[str] = mapped_column(String(512), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    cleaned_text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(16), nullable=False, default="zh")
    parse_method: Mapped[str] = mapped_column(String(32), nullable=False, default="TIKA")
    quality_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    meta_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class KnowledgeStructured(Base):
    __tablename__ = "knowledge_structured"
    __table_args__ = (
        UniqueConstraint("tenant_id", "doc_id", "version", name="uk_structured_tenant_doc_version"),
        {"schema": "kb_knowledge"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    doc_id: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    json_body: Mapped[dict] = mapped_column(JSON, nullable=False)
    extractor_ver: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class EmbedTask(Base):
    __tablename__ = "embed_task"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "doc_id", "version", "chunk_seq", "text_hash",
            name="embed_task_tenant_id_doc_id_version_chunk_seq_text_hash_key",
        ),
        {"schema": "kb_knowledge"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    doc_id: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(256))
    section_path: Mapped[Optional[str]] = mapped_column(String(256))
    page: Mapped[Optional[int]] = mapped_column(Integer)
    dept_id: Mapped[Optional[str]] = mapped_column(String(64))
    sec_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    region_code: Mapped[str] = mapped_column(String(32), nullable=False, default="CN-NATIONAL")
    biz_domain: Mapped[str] = mapped_column(String(64), nullable=False, default="COMPLIANCE")
    perm_group_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    acl_version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    milvus_pk: Mapped[Optional[int]] = mapped_column(BigInteger)
    milvus_version: Mapped[Optional[int]] = mapped_column(BigInteger)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    error_code: Mapped[Optional[str]] = mapped_column(String(64))
    error_msg: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
