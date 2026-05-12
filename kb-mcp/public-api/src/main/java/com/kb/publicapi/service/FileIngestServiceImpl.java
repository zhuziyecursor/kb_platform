package com.kb.publicapi.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.publicapi.audit.AuditLogger;
import com.kb.publicapi.config.PublicApiProperties;
import com.kb.publicapi.dto.DocStatusResponse;
import com.kb.publicapi.dto.FileIngestResponse;
import com.kb.publicapi.exception.PublicApiException;
import com.kb.publicapi.idempotency.IdempotencyStore;
import com.kb.publicapi.security.ApiKeyConfig;
import com.kb.publicapi.security.RequestContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileIngestServiceImpl implements FileIngestService {

    private static final int MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    private final RestTemplate ingestRestTemplate;
    private final RestTemplate minioRestTemplate;
    private final PublicApiProperties properties;
    private final IdempotencyStore idempotencyStore;
    private final AuditLogger auditLogger;
    private final ObjectMapper objectMapper;

    @Override
    public FileIngestResponse ingest(byte[] fileBytes, String filename, String contentType,
                                     String docType, String bizDomain, String regionCode,
                                     String knowledgeSpaceId, String aclJson, String labelTags,
                                     String idempotencyKey) {
        long startTime = System.currentTimeMillis();
        String traceId = "tr-" + UUID.randomUUID();
        ApiKeyConfig apiKeyConfig = RequestContext.get();
        String tenantId = apiKeyConfig.tenantId();
        String apiKey = resolveApiKey();

        // 1. Idempotency check
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            String idemKey = apiKey + ":" + idempotencyKey;
            Optional<FileIngestResponse> cached = idempotencyStore.get(idemKey);
            if (cached.isPresent()) {
                log.info("Idempotent replay for key={}", idempotencyKey);
                auditLogger.log(apiKey, tenantId, "POST", "/openapi/v1/kb/files/ingest",
                        idempotencyKey, 200, cached.get().getTraceId(),
                        cached.get().getDocId(), System.currentTimeMillis() - startTime);
                return cached.get();
            }
        }

        // 2. Validate file size
        if (fileBytes.length > MAX_FILE_SIZE) {
            throw PublicApiException.fileTooLarge(MAX_FILE_SIZE, fileBytes.length);
        }

        // 3. Compute SHA-256
        String sha256 = computeSha256(fileBytes);

        // 4. Call ingest-service init-upload
        String ingestBaseUrl = properties.getClient().getIngestService().getBaseUrl();
        Map<String, Object> initBody = new java.util.LinkedHashMap<>();
        initBody.put("tenantId", tenantId);
        initBody.put("filename", filename);
        initBody.put("fileSize", fileBytes.length);
        initBody.put("fileHash", sha256);
        initBody.put("docType", docType != null ? docType : "OTHER");
        initBody.put("bizDomain", bizDomain != null ? bizDomain : "GENERAL");
        initBody.put("regionCode", regionCode != null ? regionCode : "CN-NATIONAL");
        initBody.put("secLevel", apiKeyConfig.secLevel());
        initBody.put("ownerUid", apiKeyConfig.ownerUid());
        initBody.put("deptId", apiKeyConfig.deptId());
        initBody.put("knowledgeSpaceId", knowledgeSpaceId != null ? knowledgeSpaceId : "DEFAULT");
        if (labelTags != null && !labelTags.isBlank()) {
            initBody.put("labelTags", labelTags);
        }

        ResponseEntity<Map> initResp;
        try {
            initResp = ingestRestTemplate.postForEntity(
                    ingestBaseUrl + "/kb/v1/docs/init-upload",
                    new HttpEntity<>(initBody),
                    Map.class);
        } catch (Exception e) {
            log.error("init-upload failed", e);
            throw PublicApiException.upstreamUnavailable("ingest-service");
        }

        if (!initResp.getStatusCode().is2xxSuccessful() || initResp.getBody() == null) {
            throw PublicApiException.upstreamError("init-upload returned " + initResp.getStatusCode());
        }

        Map<String, Object> initData = initResp.getBody();
        String docId = (String) initData.get("docId");
        String presignedUrl = (String) initData.get("presignedUrl");

        // 5. Upload to MinIO via presigned URL
        try {
            HttpHeaders uploadHeaders = new HttpHeaders();
            uploadHeaders.setContentType(MediaType.parseMediaType(
                    contentType != null ? contentType : "application/octet-stream"));
            uploadHeaders.setContentLength(fileBytes.length);

            ResponseEntity<String> uploadResp = minioRestTemplate.exchange(
                    presignedUrl,
                    HttpMethod.PUT,
                    new HttpEntity<>(fileBytes, uploadHeaders),
                    String.class);

            if (!uploadResp.getStatusCode().is2xxSuccessful()) {
                throw PublicApiException.upstreamError("MinIO upload failed: " + uploadResp.getStatusCode());
            }
        } catch (PublicApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("MinIO upload failed for docId={}", docId, e);
            throw PublicApiException.upstreamUnavailable("MinIO");
        }

        // 6. Call verify-upload
        try {
            ingestRestTemplate.postForEntity(
                    ingestBaseUrl + "/kb/v1/docs/{docId}/verify-upload?version=1",
                    null,
                    Map.class,
                    docId);
        } catch (Exception e) {
            log.error("verify-upload failed for docId={}", docId, e);
            throw PublicApiException.upstreamError("verify-upload failed");
        }

        // 7. Call commit
        List<Map<String, String>> aclEntries = parseAcl(aclJson, apiKeyConfig.deptId());
        Map<String, Object> commitBody = Map.of(
                "tenantId", tenantId,
                "sha256", sha256,
                "acl", aclEntries
        );

        try {
            ingestRestTemplate.postForEntity(
                    ingestBaseUrl + "/kb/v1/docs/{docId}/commit?version=1",
                    new HttpEntity<>(commitBody),
                    Map.class,
                    docId);
        } catch (Exception e) {
            log.error("commit failed for docId={}", docId, e);
            throw PublicApiException.upstreamError("commit failed");
        }

        // 8. Call ingest
        ResponseEntity<Map> ingestResp;
        try {
            ingestResp = ingestRestTemplate.postForEntity(
                    ingestBaseUrl + "/kb/v1/docs/{docId}/ingest?version=1",
                    null,
                    Map.class,
                    docId);
        } catch (Exception e) {
            log.error("ingest failed for docId={}", docId, e);
            throw PublicApiException.upstreamError("ingest failed");
        }

        Map<String, Object> ingestData = ingestResp.getBody();
        String status = ingestData != null ? (String) ingestData.getOrDefault("status", "PROCESSING") : "PROCESSING";

        // 9. Build response
        FileIngestResponse response = FileIngestResponse.builder()
                .docId(docId)
                .version(1)
                .jobId(docId)
                .status(status)
                .message("入库任务已提交")
                .traceId(traceId)
                .statusUrl("/openapi/v1/kb/files/" + docId + "/status")
                .build();

        // 10. Store idempotency
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            idempotencyStore.put(apiKey + ":" + idempotencyKey, response);
        }

        // 11. Audit
        long latency = System.currentTimeMillis() - startTime;
        auditLogger.log(apiKey, tenantId, "POST", "/openapi/v1/kb/files/ingest",
                idempotencyKey, 202, traceId, docId, latency);

        return response;
    }

    @Override
    public DocStatusResponse getStatus(String docId) {
        String ingestBaseUrl = properties.getClient().getIngestService().getBaseUrl();
        ResponseEntity<Map> resp;
        try {
            resp = ingestRestTemplate.getForEntity(
                    ingestBaseUrl + "/kb/v1/docs/{docId}/status?version=1",
                    Map.class,
                    docId);
        } catch (Exception e) {
            log.error("getStatus failed for docId={}", docId, e);
            throw PublicApiException.upstreamUnavailable("ingest-service");
        }

        if (resp.getBody() == null) {
            throw PublicApiException.docNotFound(docId);
        }

        Map<String, Object> data = resp.getBody();
        return DocStatusResponse.builder()
                .docId((String) data.get("docId"))
                .version(data.get("version") != null ? ((Number) data.get("version")).intValue() : 1)
                .status((String) data.get("status"))
                .retryCount(data.get("retryCount") != null ? ((Number) data.get("retryCount")).intValue() : 0)
                .lastError((String) data.get("lastError"))
                .traceId((String) data.get("traceId"))
                .build();
    }

    private List<Map<String, String>> parseAcl(String aclJson, String deptId) {
        if (aclJson != null && !aclJson.isBlank()) {
            try {
                return objectMapper.readValue(aclJson, new TypeReference<>() {});
            } catch (Exception e) {
                log.warn("Failed to parse acl JSON, using default: {}", aclJson);
            }
        }
        return List.of(Map.of(
                "accessorType", "DEPT",
                "accessorId", deptId,
                "permission", "READ"
        ));
    }

    private String computeSha256(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data);
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private String resolveApiKey() {
        return "pk-dev-0000000000000001"; // Phase 1: return configured key identifier
    }
}
