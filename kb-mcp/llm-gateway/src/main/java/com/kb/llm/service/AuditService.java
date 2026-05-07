package com.kb.llm.service;

import com.kb.llm.dto.AuditLogEntry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class AuditService {

    /**
     * Log structured audit entry as JSON.
     * PHASE2: write to kb_audit.llm_call_log table.
     */
    public void log(AuditLogEntry entry) {
        log.info("LLM_AUDIT traceId={} tenantId={} provider={} model={} status={} "
                        + "promptTokens={} completionTokens={} latencyMs={} errorCode={}",
                entry.getTraceId(), entry.getTenantId(), entry.getProvider(),
                entry.getModel(), entry.getStatus(),
                entry.getPromptTokens(), entry.getCompletionTokens(),
                entry.getLatencyMs(), entry.getErrorCode());
    }
}
