package com.kb.ingest.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.dev-context")
public class DevContextProperties {

    /**
     * MVP/dev fallback tenant. PHASE2/3 should replace this with JWT/OBO claims.
     */
    private String tenantId = "dev-tenant-001";

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }
}
