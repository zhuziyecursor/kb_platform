package com.kb.publicapi.config;

import com.kb.publicapi.security.ApiKeyConfig;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Map;

@Data
@Component
@ConfigurationProperties(prefix = "app.public-api")
public class PublicApiProperties {

    // API Key 配置（扁平化结构，因为 YAML map key 不支持 ${} 占位符）
    private String apiKey = "pk-dev-0000000000000001";
    private String apiKeyTenantId = "dev-tenant-001";
    private String apiKeyUserId = "current-user";
    private String apiKeyOwnerUid = "u-dev-001";
    private String apiKeyDeptId = "D01";
    private int apiKeySecLevel = 5;

    private Idempotency idempotency = new Idempotency();

    private Client client = new Client();

    /**
     * Get ApiKeyConfig for the configured API key.
     * Used by ApiKeyAuthFilter to validate and extract claims.
     */
    public Map<String, ApiKeyConfig> getApiKeys() {
        ApiKeyConfig config = new ApiKeyConfig(
                apiKeyTenantId,
                apiKeyUserId,
                apiKeyOwnerUid,
                apiKeyDeptId,
                apiKeySecLevel
        );
        return Map.of(apiKey, config);
    }

    @Data
    public static class Idempotency {
        private int ttlHours = 24;
        private int maxEntries = 10000;
    }

    @Data
    public static class Client {
        private IngestService ingestService = new IngestService();
        private RagService ragService = new RagService();
        private Minio minio = new Minio();
    }

    @Data
    public static class IngestService {
        private String baseUrl;
        private int connectTimeoutSeconds = 10;
        private int readTimeoutSeconds = 60;
    }

    @Data
    public static class RagService {
        private String baseUrl;
        private int connectTimeoutSeconds = 10;
        private int readTimeoutSeconds = 120;
    }

    @Data
    public static class Minio {
        private int connectTimeoutSeconds = 10;
        private int readTimeoutSeconds = 300;
    }
}
