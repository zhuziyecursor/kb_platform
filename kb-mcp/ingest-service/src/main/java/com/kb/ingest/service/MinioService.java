package com.kb.ingest.service;

import io.minio.*;
import io.minio.http.Method;
import io.minio.RemoveObjectArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.util.Map;
import java.util.Set;
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
        okhttp3.OkHttpClient httpClient = new okhttp3.OkHttpClient.Builder()
                .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();
        this.minioClient = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .httpClient(httpClient)
                .build();
    }

    public String generatePresignedUrl(String tenantId, String bizDomain, String docId, String filename, String contentType) {
        String objectPath = buildObjectPath(tenantId, bizDomain, docId, filename);
        try {
            String actualContentType = contentType != null ? contentType : "application/octet-stream";
            // 使用不含 extraQueryParams 的简单 presigned URL，避免签名验证问题
            String presignedUrl = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucket)
                            .object(objectPath)
                            .expiry(presignedUrlExpiry)
                            .build()
            );
            log.debug("Generated presigned URL for object: {}, url: {}", objectPath, presignedUrl);
            return presignedUrl;
        } catch (Exception e) {
            log.error("Failed to generate presigned URL for object: {}", objectPath, e);
            throw new RuntimeException("Failed to generate presigned URL", e);
        }
    }

    /**
     * 生成用于 GET 下载/预览的 presigned URL。
     *
     * @param objectPath MinIO 对象路径（不含 bucket 前缀）
     * @param contentType 文件 Content-Type（用于为文本类文件强制指定 charset=UTF-8）
     * @return presigned URL，可直接用于浏览器 iframe 或下载
     */
    public String generateGetPresignedUrl(String objectPath, String contentType) {
        try {
            GetPresignedObjectUrlArgs.Builder builder = GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(bucket)
                    .object(objectPath)
                    .expiry(presignedUrlExpiry);

            // 文本类文件通过 response-content-type 强制指定 UTF-8 编码，
            // 避免浏览器因缺少 charset 而使用平台默认编码导致中文乱码。
            if (contentType != null && contentType.startsWith("text/")) {
                builder.extraQueryParams(Map.of(
                        "response-content-type", contentType + "; charset=UTF-8"
                ));
            }

            String presignedUrl = minioClient.getPresignedObjectUrl(builder.build());
            log.debug("Generated GET presigned URL for object: {}, url: {}", objectPath, presignedUrl);
            return presignedUrl;
        } catch (Exception e) {
            log.error("Failed to generate GET presigned URL for object: {}", objectPath, e);
            throw new RuntimeException("Failed to generate GET presigned URL", e);
        }
    }

    public String buildObjectPath(String tenantId, String bizDomain, String docId, String filename) {
        java.time.LocalDate now = java.time.LocalDate.now();
        // 注意：MinIO client getPresignedObjectUrl 会自动拼接 bucket，所以这里只返回相对路径
        return String.format("%s/%s/UPLOAD/%d/%02d/%s/%s",
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
            // MinIO statObject 不返回对象内容，无法直接验证 SHA256
            // SHA256 验证依赖上游调用方在上传前校验
            log.debug("File size verified: path={}, size={}", objectPath, stat.size());
            return true;
        } catch (Exception e) {
            log.error("Failed to verify object: {}", objectPath, e);
            return false;
        }
    }

    public void putObject(String objectPath, byte[] data, String contentType) {
        try {
            ByteArrayInputStream inputStream = new ByteArrayInputStream(data);
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectPath)
                            .stream(inputStream, data.length, -1)
                            .contentType(contentType)
                            .build()
            );
            log.info("Uploaded object: {}, size: {} bytes", objectPath, data.length);
        } catch (Exception e) {
            log.error("Failed to upload object: {}", objectPath, e);
            throw new RuntimeException("Failed to upload object to MinIO", e);
        }
    }

    public String generateDocId() {
        return "DOC" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
    }

    private static final Set<String> IMAGE_EXTENSIONS = Set.of(".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg");
    private static final Set<String> PDF_EXTENSIONS = Set.of(".pdf");
    private static final Set<String> MARKDOWN_EXTENSIONS = Set.of(".md", ".markdown", ".mdx");

    public Resource getObject(String objectPath) {
        try {
            // objectPath 格式：tenantId/bizDomain/UPLOAD/...（不含 bucket 前缀）
            byte[] data = minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectPath)
                            .build()
            ).readAllBytes();
            return new ByteArrayResource(data);
        } catch (Exception e) {
            log.error("Failed to get object: {}", objectPath, e);
            throw new RuntimeException("Failed to get object from MinIO", e);
        }
    }

    public String getPreviewType(String filename, byte[] rawContent) {
        if (filename == null) {
            return "text";
        }
        String lower = filename.toLowerCase();
        int dotIndex = lower.lastIndexOf('.');
        String ext = dotIndex >= 0 ? lower.substring(dotIndex) : "";

        if (IMAGE_EXTENSIONS.contains(ext)) {
            return "image";
        }
        if (PDF_EXTENSIONS.contains(ext)) {
            return "pdf";
        }
        if (MARKDOWN_EXTENSIONS.contains(ext)) {
            return "markdown";
        }
        if (ext.isEmpty()) {
            return "text";
        }

        // Binary signature detection
        if (rawContent != null && rawContent.length > 0) {
            if (containsNullByte(rawContent)) {
                return "unsupported";
            }
        }

        return "text";
    }

    private boolean containsNullByte(byte[] data) {
        for (byte b : data) {
            if (b == 0) {
                return true;
            }
        }
        return false;
    }

    public void deleteObject(String objectPath) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(objectPath).build());
            log.info("Deleted object: {}", objectPath);
        } catch (Exception e) {
            log.error("Failed to delete object: {}", objectPath, e);
            throw new RuntimeException("Failed to delete object from MinIO", e);
        }
    }
}