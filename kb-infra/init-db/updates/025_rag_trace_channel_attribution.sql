-- 025_rag_trace_channel_attribution.sql
-- 为 rag_pipeline_trace 增加通道归因字段，支撑 A/B 评测和故障排查

BEGIN;

ALTER TABLE kb_audit.rag_pipeline_trace
    ADD COLUMN IF NOT EXISTS channel_hits JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN kb_audit.rag_pipeline_trace.channel_hits IS
'各通道召回统计: {DENSE:50, SPARSE:32, STRUCTURED:2, METADATA:0, FAQ:0, intersectionCount:18, finalFromChannel:{DENSE:3,SPARSE:1,STRUCTURED:1}}';

COMMENT ON COLUMN kb_audit.rag_pipeline_trace.hit_docs IS
'引用文档摘要数组(v2): [{docId,title,score,version,page,sourceChannels:[DENSE|SPARSE|STRUCTURED|METADATA|FAQ],channelRanks:{DENSE:3,SPARSE:1},fusionScore:float}]';

COMMIT;
