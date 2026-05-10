import json
from dataclasses import dataclass, field
from typing import Optional

from confluent_kafka import Producer


@dataclass
class FileIngestMessage:
    trace_id: str
    tenant_id: str
    doc_id: str
    version: int
    src_path: str
    sha256: str
    sec_level: int
    region_code: str = "CN-NATIONAL"
    biz_domain: str = "COMPLIANCE"
    doc_type: str = "OTHER"
    owner_uid: Optional[str] = None
    dept_id: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    knowledge_space_id: str = "DEFAULT"
    chunk_config: dict = field(default_factory=dict)
    page_limit: int = 30
    ocr_disabled: bool = True
    label_tags: str = ""  # 文档级标签，逗号分隔（从 ingest-service InitUploadRequest 传入）

    @classmethod
    def from_dict(cls, data: dict) -> "FileIngestMessage":
        return cls(
            trace_id=data["traceId"],
            tenant_id=data["tenantId"],
            doc_id=data["docId"],
            version=data["version"],
            src_path=data["srcPath"],
            sha256=data["sha256"],
            sec_level=data["secLevel"],
            region_code=data.get("regionCode", "CN-NATIONAL"),
            biz_domain=data.get("bizDomain", "COMPLIANCE"),
            doc_type=data.get("docType", "OTHER"),
            owner_uid=data.get("ownerUid"),
            dept_id=data.get("deptId"),
            effective_from=data.get("effectiveFrom"),
            effective_to=data.get("effectiveTo"),
            knowledge_space_id=data.get("knowledgeSpaceId", "DEFAULT"),
            chunk_config=data.get("chunkConfig", {}),
            page_limit=data.get("pageLimit", 30),
            ocr_disabled=data.get("ocrDisabled", True),
            label_tags=data.get("labelTags", ""),
        )


@dataclass
class EmbedTaskMessage:
    trace_id: str
    tenant_id: str
    doc_id: str
    version: int
    chunk_seq: int
    text: str
    text_hash: str
    title: str
    section_path: Optional[str]
    page: Optional[int]
    sec_level: int
    region_code: str
    biz_domain: str
    perm_group_id: int
    acl_version: int
    owner_uid: Optional[str]
    dept_id: Optional[str]
    effective_from: Optional[str]
    effective_to: Optional[str]
    create_time: int
    tags: str = ""           # 继承展平标签，逗号分隔
    chunk_type: str = ""     # 段落语义类型
    vector: Optional[list[float]] = None
    parent_ref: str = ""     # Parent chunk 引用，格式: "docId/version/parentSeq"，无 Parent 时为空

    def to_dict(self) -> dict:
        data = {
            "traceId": self.trace_id,
            "tenantId": self.tenant_id,
            "docId": self.doc_id,
            "version": self.version,
            "chunkSeq": self.chunk_seq,
            "text": self.text,
            "textHash": self.text_hash,
            "title": self.title,
            "sectionPath": self.section_path,
            "page": self.page,
            "secLevel": self.sec_level,
            "regionCode": self.region_code,
            "bizDomain": self.biz_domain,
            "permGroupId": self.perm_group_id,
            "aclVersion": self.acl_version,
            "ownerUid": self.owner_uid,
            "deptId": self.dept_id,
            "effectiveFrom": self.effective_from,
            "effectiveTo": self.effective_to,
            "createTime": self.create_time,
            "tags": self.tags,
            "chunkType": self.chunk_type,
            "parentRef": self.parent_ref,
        }
        if self.vector is not None:
            data["vector"] = {"index": 0, "embedding": self.vector}
        return data


class KafkaProducer:
    def __init__(self, config: dict):
        self._producer = Producer(config)

    def send(self, topic: str, key: str, value: dict):
        self._producer.produce(
            topic=topic,
            key=key,
            value=json.dumps(value, ensure_ascii=False).encode("utf-8"),
            callback=self._delivery_callback,
        )

    def flush(self, timeout: float = 30.0):
        self._producer.flush(timeout)

    @staticmethod
    def _delivery_callback(err, msg):
        if err is not None:
            print(f"[KafkaProducer] Delivery failed: {err}")

    def close(self):
        self._producer.flush(30)
