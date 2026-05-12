package com.kb.publicapi.audit;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.StringJoiner;

@Slf4j
@Component
public class AuditLogger {

    private static final Logger AUDIT_LOG = LoggerFactory.getLogger("AUDIT");

    public void log(String apiKey, String tenantId, String method, String path,
                    String idempotencyKey, int statusCode, String traceId,
                    String docId, long latencyMs) {
        StringJoiner sj = new StringJoiner(" ");
        sj.add("apiKey=" + maskKey(apiKey));
        sj.add("tenantId=" + tenantId);
        sj.add("method=" + method);
        sj.add("path=" + path);
        if (idempotencyKey != null) {
            sj.add("idempotencyKey=" + idempotencyKey);
        }
        sj.add("statusCode=" + statusCode);
        sj.add("traceId=" + traceId);
        if (docId != null) {
            sj.add("docId=" + docId);
        }
        sj.add("latencyMs=" + latencyMs);

        AUDIT_LOG.info(sj.toString());
    }

    private String maskKey(String apiKey) {
        if (apiKey == null || apiKey.length() <= 11) return "***";
        return apiKey.substring(0, 11) + "***";
    }
}
