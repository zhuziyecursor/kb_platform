#!/bin/bash
# clean-all-data.sh - 清空知识库所有数据（PostgreSQL + Milvus + MinIO）
# 用途：测试环境重置

set -e

echo "=========================================="
echo "开始清空知识库所有数据..."
echo "=========================================="

# PostgreSQL 清理
echo ""
echo "[1/3] 清理 PostgreSQL (kb_knowledge schema)..."

docker exec kb-postgres psql -U kb_admin -d kb_knowledge << 'EOF'
-- 清理顺序：先清理有外键依赖的表
TRUNCATE TABLE kb_knowledge.embed_task RESTART IDENTITY CASCADE;
TRUNCATE TABLE kb_knowledge.knowledge_version RESTART IDENTITY CASCADE;
TRUNCATE TABLE kb_knowledge.doc_acl RESTART IDENTITY CASCADE;
TRUNCATE TABLE kb_knowledge.knowledge_clean RESTART IDENTITY CASCADE;
TRUNCATE TABLE kb_knowledge.knowledge_structured RESTART IDENTITY CASCADE;
TRUNCATE TABLE kb_knowledge.knowledge_doc RESTART IDENTITY CASCADE;
TRUNCATE TABLE kb_knowledge.knowledge_space RESTART IDENTITY CASCADE;

-- 验证清理结果
SELECT 'knowledge_space' as table_name, COUNT(*) as rows FROM kb_knowledge.knowledge_space
UNION ALL SELECT 'knowledge_doc', COUNT(*) FROM kb_knowledge.knowledge_doc
UNION ALL SELECT 'doc_acl', COUNT(*) FROM kb_knowledge.doc_acl
UNION ALL SELECT 'knowledge_version', COUNT(*) FROM kb_knowledge.knowledge_version
UNION ALL SELECT 'embed_task', COUNT(*) FROM kb_knowledge.embed_task
UNION ALL SELECT 'knowledge_clean', COUNT(*) FROM kb_knowledge.knowledge_clean
UNION ALL SELECT 'knowledge_structured', COUNT(*) FROM kb_knowledge.knowledge_structured;
EOF

echo "PostgreSQL 清理完成"

# Milvus 清理
echo ""
echo "[2/3] 清理 Milvus 向量数据..."

docker run --rm --network kb-infra_kb-network python:3.11-slim sh -c "
    pip install pymilvus -i https://pypi.tuna.tsinghua.edu.cn/simple -q
    python << 'PYEOF'
from pymilvus import connections, Collection, utility

connections.connect(host='milvus', port=19530)

collections = utility.list_collections()
print(f'找到 {len(collections)} 个 collection: {collections}')

for name in collections:
    c = Collection(name)
    c.flush()
    c.delete(expr='id >= 0')
    c.flush()
    print(f'  {name}: 数据已清空')

print('Milvus 数据清理完成（collection schema 已保留）')
PYEOF
"

echo "Milvus 清理完成"

# MinIO 清理
echo ""
echo "[3/3] 清理 MinIO 对象存储..."

docker exec kb-minio mc rm -r --force local/kb-raw/ 2>/dev/null || echo "[跳过] kb-raw"
docker exec kb-minio mc rm -r --force local/kb-backup/ 2>/dev/null || echo "[跳过] kb-backup"
docker exec kb-minio mc rm -r --force local/kb-models/ 2>/dev/null || echo "[跳过] kb-models"

echo "MinIO 清理完成"

echo ""
echo "=========================================="
echo "所有数据清理完成！"
echo "=========================================="