"""
Milvus Collection 定义脚本：kb_documents

用途：
  - 存储所有知识文档的向量化 chunks
  - 支持向量相似度检索（HNSW）
  - 支持 ACL 预过滤（tenant_id, sec_level, perm_group_id, region_code, effective_to）

执行方式：
  python contracts/milvus/kb_documents_collection.py

依赖：
  pip install pymilvus>=2.4.0

注意：此脚本仅用于初始化 Collection，
      由 kb-infra 或运维人员执行，不属于任何业务服务的职责。
"""

from pymilvus import (
    connections,
    Collection,
    CollectionSchema,
    FieldSchema,
    DataType,
    utility,
)
import os

# ─── 连接配置（从环境变量读取）─────────────────────────────────────────────────
MILVUS_HOST = os.getenv("MILVUS_HOST", "localhost")
MILVUS_PORT = os.getenv("MILVUS_PORT", "19530")
COLLECTION_NAME = "kb_documents"

# ─── 向量维度（与 embedding-service 使用的模型对应）──────────────────────────────
# BGE-zh-v1.5: 1024 维
# PHASE2: 多模型路由时此值从配置读取，一期固定 1024
VECTOR_DIM = 1024


def get_schema() -> CollectionSchema:
    """
    定义 kb_documents Collection 的字段 Schema。

    字段分类：
    1. 主键：id（INT64，Milvus 自动生成）
    2. 业务标识字段：doc_id, tenant_id, version, chunk_seq
    3. 向量字段：vector
    4. 内容字段：text, title, section_path, page
    5. ACL 预过滤字段：sec_level, region_code, biz_domain, perm_group_id, effective_from, effective_to
    6. 元数据字段：owner_uid, acl_version, create_time
    """
    fields = [
        # ── 主键 ────────────────────────────────────────────────────────────────
        FieldSchema(
            name="id",
            dtype=DataType.INT64,
            is_primary=True,
            auto_id=False,
            description="应用层生成的主键（snowflake）",
        ),

        # ── 业务标识 ─────────────────────────────────────────────────────────────
        FieldSchema(
            name="doc_id",
            dtype=DataType.VARCHAR,
            max_length=128,
            description="文档 ID（对应 knowledge_doc.doc_id）",
        ),
        FieldSchema(
            name="tenant_id",
            dtype=DataType.VARCHAR,
            max_length=64,
            description="租户 ID（ACL 预过滤必需字段）",
        ),
        FieldSchema(
            name="version",
            dtype=DataType.INT32,
            description="文档版本号（软下线时按 doc_id + version 删除）",
        ),
        FieldSchema(
            name="chunk_seq",
            dtype=DataType.INT32,
            description="切片序号，从 0 开始",
        ),

        # ── 向量 ─────────────────────────────────────────────────────────────────
        FieldSchema(
            name="vector",
            dtype=DataType.FLOAT_VECTOR,
            dim=VECTOR_DIM,
            description=f"文本 embedding 向量（dim={VECTOR_DIM}，BGE-zh-v1.5）",
        ),

        # ── 内容字段 ─────────────────────────────────────────────────────────────
        FieldSchema(
            name="text",
            dtype=DataType.VARCHAR,
            max_length=4096,
            description="原始切片文本，检索命中后返回给 rag-service 用于构造 Prompt",
        ),
        FieldSchema(
            name="title",
            dtype=DataType.VARCHAR,
            max_length=256,
            description="文档标题",
        ),
        FieldSchema(
            name="section_path",
            dtype=DataType.VARCHAR,
            max_length=256,
            description='章节路径，格式：父章节/子章节/...，如 "1/1.2/1.2.3"',
        ),
        FieldSchema(
            name="page",
            dtype=DataType.INT32,
            description="切片所在页码",
        ),

        # ── ACL 预过滤字段 ────────────────────────────────────────────────────────
        # 以下字段在 Milvus 检索时作为 filter 条件，减少 rag-service 做二次 ACL 的压力
        FieldSchema(
            name="sec_level",
            dtype=DataType.INT32,
            description="文档密级（1-5）。检索时 filter：sec_level <= user_sec_level",
        ),
        FieldSchema(
            name="region_code",
            dtype=DataType.VARCHAR,
            max_length=32,
            description='地域码，如 "CN-NATIONAL", "CN-SH"',
        ),
        FieldSchema(
            name="biz_domain",
            dtype=DataType.VARCHAR,
            max_length=64,
            description='业务域，如 "COMPLIANCE"',
        ),
        FieldSchema(
            name="perm_group_id",
            dtype=DataType.INT64,
            description=(
                "权限组 ID（ACL 预过滤核心字段）。"
                "计算方式：hash(tenant_id + accessor_type + accessor_id) % 2^63。"
                "检索时 filter：perm_group_id in [pg1, pg2, ...]（来自 OBO token 的 perm_group_ids）"
            ),
        ),
        FieldSchema(
            name="effective_from",
            dtype=DataType.VARCHAR,
            max_length=16,
            description="文档生效日期，格式 YYYY-MM-DD",
        ),
        FieldSchema(
            name="effective_to",
            dtype=DataType.VARCHAR,
            max_length=16,
            description=(
                "文档失效日期，格式 YYYY-MM-DD。空字符串表示永久有效。"
                "检索时 filter：effective_to == '' OR effective_to > today"
            ),
        ),

        # ── 元数据 ────────────────────────────────────────────────────────────────
        FieldSchema(
            name="owner_uid",
            dtype=DataType.VARCHAR,
            max_length=64,
            description="上传者用户 ID",
        ),
        FieldSchema(
            name="acl_version",
            dtype=DataType.INT64,
            description="ACL 版本号，用于检测 ACL 变更",
        ),
        FieldSchema(
            name="create_time",
            dtype=DataType.INT64,
            description="创建时间（epoch 毫秒）",
        ),
    ]

    return CollectionSchema(
        fields=fields,
        description="KB 知识库文档向量存储，支持 ACL 预过滤的密集检索",
    )


def get_index_params() -> dict:
    """
    向量索引配置（HNSW）。

    HNSW 参数说明：
    - M=32：每个节点最大连接数，越大召回率越高但内存占用更大
    - efConstruction=200：构建时的搜索深度，越大索引质量越好但构建越慢
    """
    return {
        "metric_type": "COSINE",   # BGE 模型推荐使用 COSINE 相似度
        "index_type": "HNSW",
        "params": {
            "M": 32,
            "efConstruction": 200,
        },
    }


def get_scalar_index_fields() -> list:
    """
    需要建标量索引的字段（用于 ACL 预过滤加速）。

    这些字段在 Milvus filter 中高频使用，建索引可显著提升过滤性能。
    """
    return [
        "tenant_id",       # 所有查询都有此过滤条件
        "sec_level",       # sec_level <= user_sec_level
        "perm_group_id",   # perm_group_id in [...]
        "region_code",     # 地域隔离
        "effective_to",    # 有效期过滤
    ]


def create_collection(drop_if_exists: bool = False) -> Collection:
    """创建 kb_documents Collection。"""
    connections.connect("default", host=MILVUS_HOST, port=MILVUS_PORT)

    if utility.has_collection(COLLECTION_NAME):
        if drop_if_exists:
            print(f"[WARNING] 删除已存在的 Collection: {COLLECTION_NAME}")
            utility.drop_collection(COLLECTION_NAME)
        else:
            print(f"[INFO] Collection {COLLECTION_NAME} 已存在，跳过创建")
            return Collection(COLLECTION_NAME)

    print(f"[INFO] 创建 Collection: {COLLECTION_NAME}")
    collection = Collection(
        name=COLLECTION_NAME,
        schema=get_schema(),
        # 使用 tenant_id 作为分区键，每个租户的数据物理隔离
        # PHASE2: 分区键启用，一期先用 filter 过滤，避免分区管理复杂度
        # partition_key_field="tenant_id",
    )

    # 建向量索引
    print("[INFO] 创建向量索引（HNSW）...")
    collection.create_index(
        field_name="vector",
        index_params=get_index_params(),
        index_name="vector_hnsw_index",
    )

    # 建标量索引（ACL 预过滤加速）
    for field in get_scalar_index_fields():
        print(f"[INFO] 创建标量索引: {field}")
        collection.create_index(
            field_name=field,
            index_name=f"scalar_index_{field}",
        )

    collection.load()
    print(f"[OK] Collection {COLLECTION_NAME} 创建完成并已加载到内存")
    return collection


def get_search_filter_example(
    tenant_id: str,
    user_sec_level: int,
    perm_group_ids: list,
    today: str,
) -> str:
    """
    生成标准的 Milvus 检索 ACL 过滤表达式（供 rag-service 参考）。

    rag-service 在调用 Milvus search 时必须使用此结构的 filter，
    不允许省略任何 ACL 字段。
    """
    perm_group_ids_str = ", ".join(str(p) for p in perm_group_ids)
    return (
        f"tenant_id == '{tenant_id}' AND "
        f"sec_level <= {user_sec_level} AND "
        f"perm_group_id in [{perm_group_ids_str}] AND "
        f"(effective_to == '' OR effective_to > '{today}')"
    )


if __name__ == "__main__":
    print("=== kb_documents Collection 初始化 ===")
    print(f"Milvus: {MILVUS_HOST}:{MILVUS_PORT}")
    print(f"Collection: {COLLECTION_NAME}")
    print(f"向量维度: {VECTOR_DIM}")
    print()

    collection = create_collection(drop_if_exists=False)

    print()
    print("=== 检索 filter 示例 ===")
    example_filter = get_search_filter_example(
        tenant_id="t1",
        user_sec_level=3,
        perm_group_ids=[101, 102],
        today="2026-04-27",
    )
    print(f"filter = \"{example_filter}\"")
    print()
    print("search(")
    print(f"  vector=query_vector,")
    print(f"  filter=\"{example_filter}\",")
    print(f"  topk=20,  # 召回 Top20 后经 Rerank 精排至 Top5")
    print(f"  output_fields=['doc_id', 'version', 'chunk_seq', 'text', 'title',")
    print(f"                  'section_path', 'page', 'effective_from', 'effective_to']")
    print(")")
