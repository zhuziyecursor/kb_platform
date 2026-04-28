package com.kb.ingest.service;

import io.minio.*;
import io.minio.http.Method;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
public class MinioService {

    private final MinioClient minioClient;

    @Value("${spring.minio.bucket:kb-raw}")
    private String bucket;

    @Value("${spring.minio.presigned-url-expiry:300}")
    private int presignedUrlExpiry;

    public MinioService(
            @Value("${spring.minio.endpoint}") String endpoint,
            @Value("${spring.minio.access-key}") String accessKey,
            @Value("${spring.minio.secret-key}") String secretKey) {
        this.minioClient = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }

    public String generatePresignedUrl(String tenantId, String bizDomain, String docId, String filename) {
        String objectPath = buildObjectPath(tenantId, bizDomain, docId, filename);
        try {
            String presignedUrl = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucket)
                            .object(objectPath)
                            .expiry(presignedUrlExpiry)
                            .extraQueryParams(Map.of(
                                    "content-type", "application/pdf",
                                    "content-length-range", "1-52428800"
                            ))
                            .build()
            );
            log.debug("Generated presigned URL for object: {}, url: {}", objectPath, presignedUrl);
            return presignedUrl;
        } catch (Exception e) {
            log.error("Failed to generate presigned URL for object: {}", objectPath, e);
            throw new RuntimeException("Failed to generate presigned URL", e);
        }
    }

    public String buildObjectPath(String tenantId, String bizDomain, String docId, String filename) {
        java.time.LocalDate now = java.time.LocalDate.now();
        return String.format("kb-raw/%s/%s/UPLOAD/%d/%02d/%s/%s",
                tenantId, bizDomain, now.getYear(), now.getMonthValue(), docId, filename);
    }

    public boolean verifyObject(String objectPath, long expectedSize, String expectedSha256) {
        try {
            StatObjectResponse stat = minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectPath)
                            .build()
            );
            if (stat.size() != expectedSize) {
                log.warn("File size mismatch: expected={}, actual={}", expectedSize, stat.size());
                return false;
            }
            return true;
        } catch (Exception e) {
            log.error("Failed to verify object: {}", objectPath, e);
            return false;
        }
    }

    public String generateDocId() {
        return "DOC" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
    }
}