-- 017_add_metadata_fields.sql
-- 元数据自动抽取：embed_task 表新增 keywords 和 summary 字段
-- 说明：keywords 字段在 Python 模型中早已定义并使用，但数据库脚本此前遗漏，本次一并补上

BEGIN;

-- 新增 keywords 字段：空格分隔的关键词列表，用于 BM25 混合检索
ALTER TABLE kb_knowledge.embed_task
    ADD COLUMN IF NOT EXISTS keywords VARCHAR(512) NOT NULL DEFAULT '';

-- 新增 summary 字段：单句摘要，≤200字符，用于 rerank 阶段 query vs summary 提高精度
ALTER TABLE kb_knowledge.embed_task
    ADD COLUMN IF NOT EXISTS summary VARCHAR(256) NOT NULL DEFAULT '';

-- 字段注释
COMMENT ON COLUMN kb_knowledge.embed_task.keywords IS '关键词，空格分隔，由 MetadataExtractor（jieba TF-IDF + 词性过滤）自动提取';
COMMENT ON COLUMN kb_knowledge.embed_task.summary IS '单句摘要，≤200字符，由 MetadataExtractor（TextRank/首句）自动提取';

COMMIT;
