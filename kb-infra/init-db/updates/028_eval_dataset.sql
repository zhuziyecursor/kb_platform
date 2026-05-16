-- =============================================================================
-- 评测数据集生成 & RAG 准确度验证系统
-- rag-service 拥有，写入 kb_audit schema
-- =============================================================================

-- 数据集主表
CREATE TABLE IF NOT EXISTS kb_audit.eval_dataset (
    id              BIGSERIAL PRIMARY KEY,
    dataset_id      VARCHAR(64) NOT NULL,
    tenant_id       VARCHAR(64) NOT NULL DEFAULT 'default',
    name            VARCHAR(256) NOT NULL,
    description     TEXT,
    source_type     VARCHAR(32) NOT NULL,          -- HTML_FILES | MANUAL_UPLOAD | CHUNK_IMPORT
    source_path     TEXT,                          -- filesystem path or source description
    file_count      INT NOT NULL DEFAULT 0,
    total_chunks    INT NOT NULL DEFAULT 0,
    total_qa_pairs  INT NOT NULL DEFAULT 0,
    qa_config       JSONB NOT NULL DEFAULT '{}',   -- {types, counts, model, temperature}
    status          VARCHAR(32) NOT NULL DEFAULT 'DRAFT',  -- DRAFT | GENERATING | COMPLETED | FAILED
    progress        JSONB NOT NULL DEFAULT '{}',   -- {stage, completedQa, totalQa, startedAt}
    trace_id        VARCHAR(128),                  -- generation pipeline trace
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uk_eval_dataset_id UNIQUE (dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_dataset_tenant ON kb_audit.eval_dataset (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_dataset_status ON kb_audit.eval_dataset (status);

COMMENT ON TABLE kb_audit.eval_dataset IS '评测数据集主表，记录每次数据集生成的配置和状态';
COMMENT ON COLUMN kb_audit.eval_dataset.source_type IS 'HTML_FILES=本地HTML文件, MANUAL_UPLOAD=手动上传, CHUNK_IMPORT=已有分块导入';
COMMENT ON COLUMN kb_audit.eval_dataset.status IS 'DRAFT=草稿, GENERATING=生成中, COMPLETED=已完成, FAILED=失败';
COMMENT ON COLUMN kb_audit.eval_dataset.qa_config IS '{targetCount, typeDistribution: {FACTUAL, COMPARISON, MULTI_HOP, UNANSWERABLE}, model, temperature}';
COMMENT ON COLUMN kb_audit.eval_dataset.progress IS '{stage, completedQa, totalQa, startedAt, estimatedRemainingMs}';

-- QA 对表
CREATE TABLE IF NOT EXISTS kb_audit.eval_qa_pair (
    id              BIGSERIAL PRIMARY KEY,
    pair_id         VARCHAR(64) NOT NULL,
    dataset_id      VARCHAR(64) NOT NULL REFERENCES kb_audit.eval_dataset(dataset_id) ON DELETE CASCADE,
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL,
    qa_type         VARCHAR(32) NOT NULL,          -- FACTUAL | COMPARISON | MULTI_HOP | UNANSWERABLE
    source_chunk_ids TEXT[] NOT NULL DEFAULT '{}',
    source_doc_path  TEXT,
    difficulty      VARCHAR(16) DEFAULT 'MEDIUM',  -- EASY | MEDIUM | HARD
    tags            TEXT[] DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',   -- {generationPrompt, modelUsed, tokenCount}
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uk_eval_qa_pair_id UNIQUE (pair_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_qa_dataset    ON kb_audit.eval_qa_pair (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_qa_type       ON kb_audit.eval_qa_pair (qa_type);
CREATE INDEX IF NOT EXISTS idx_eval_qa_difficulty ON kb_audit.eval_qa_pair (difficulty);
CREATE INDEX IF NOT EXISTS idx_eval_qa_dataset_type ON kb_audit.eval_qa_pair (dataset_id, qa_type);

COMMENT ON TABLE kb_audit.eval_qa_pair IS '评测 QA 对，每条记录包含问题、答案、类型、难度和来源信息';
COMMENT ON COLUMN kb_audit.eval_qa_pair.qa_type IS 'FACTUAL=事实型, COMPARISON=对比型, MULTI_HOP=多跳推理, UNANSWERABLE=不可回答';
COMMENT ON COLUMN kb_audit.eval_qa_pair.difficulty IS 'EASY=单chunk直接匹配, MEDIUM=2-3 chunk跨段, HARD=跨文档综合';

-- 评测运行表
CREATE TABLE IF NOT EXISTS kb_audit.eval_run (
    id              BIGSERIAL PRIMARY KEY,
    run_id          VARCHAR(64) NOT NULL,
    dataset_id      VARCHAR(64) NOT NULL REFERENCES kb_audit.eval_dataset(dataset_id) ON DELETE CASCADE,
    tenant_id       VARCHAR(64) NOT NULL DEFAULT 'default',
    status          VARCHAR(32) NOT NULL DEFAULT 'PENDING',  -- PENDING | RUNNING | COMPLETED | FAILED
    config          JSONB NOT NULL DEFAULT '{}',     -- {spaceId, topK, rerankEnabled}
    metrics         JSONB NOT NULL DEFAULT '{}',     -- {exactMatch, f1, recall, llmJudgeScore, totalQa, completedQa}
    progress        JSONB NOT NULL DEFAULT '{}',     -- {completedQa, totalQa, currentBatch}
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uk_eval_run_id UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_run_dataset ON kb_audit.eval_run (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_run_status  ON kb_audit.eval_run (status);

COMMENT ON TABLE kb_audit.eval_run IS '评测运行记录，每次对数据集执行 RAG 评测的运行信息';
COMMENT ON COLUMN kb_audit.eval_run.config IS '{spaceId, topK, rerankEnabled, model}';
COMMENT ON COLUMN kb_audit.eval_run.metrics IS '{exactMatch, f1, recall, llmJudgeScore, avgLatencyMs, perType: {FACTUAL: {...}}}';

-- 单条评测结果表
CREATE TABLE IF NOT EXISTS kb_audit.eval_qa_result (
    id              BIGSERIAL PRIMARY KEY,
    run_id          VARCHAR(64) NOT NULL REFERENCES kb_audit.eval_run(run_id) ON DELETE CASCADE,
    pair_id         VARCHAR(64) NOT NULL REFERENCES kb_audit.eval_qa_pair(pair_id) ON DELETE CASCADE,
    rag_answer      TEXT,
    rag_trace_id    VARCHAR(128),
    exact_match     BOOLEAN,
    f1_score        DOUBLE PRECISION,
    recall          DOUBLE PRECISION,
    llm_judge_score DOUBLE PRECISION,               -- 1-5
    llm_judge_reason TEXT,
    citations_count INT,
    latency_ms      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_result_run  ON kb_audit.eval_qa_result (run_id);
CREATE INDEX IF NOT EXISTS idx_eval_result_pair ON kb_audit.eval_qa_result (pair_id);

COMMENT ON TABLE kb_audit.eval_qa_result IS '单条评测结果，记录每个 QA 对在 RAG 系统中的评测得分';
COMMENT ON COLUMN kb_audit.eval_qa_result.llm_judge_score IS 'LLM-as-Judge 评分 1-5';
COMMENT ON COLUMN kb_audit.eval_qa_result.llm_judge_reason IS 'LLM 评判理由';

-- 授予 kb_rag 读写权限
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_dataset TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_qa_pair TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_run TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_qa_result TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_audit TO kb_rag;
