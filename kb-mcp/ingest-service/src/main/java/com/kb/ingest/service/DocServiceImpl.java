package com.kb.ingest.service;

import com.kb.ingest.dto.*;
import com.kb.ingest.entity.DocAcl;
import com.kb.ingest.entity.KnowledgeDoc;
import com.kb.ingest.entity.KnowledgeVersion;
import com.kb.ingest.repository.DocAclRepository;
import com.kb.ingest.repository.KnowledgeDocRepository;
import com.kb.ingest.repository.KnowledgeVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DocServiceImpl implements DocService {

    private final KnowledgeDocRepository docRepository;
    private final KnowledgeVersionRepository versionRepository;
    private final DocAclRepository aclRepository;
    private final MinioService minioService;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    private static final String FILE_INGEST_TOPIC = "file-ingest";

    @Override
    @Transactional
    public InitUploadResponse initUpload(InitUploadRequest request) {
        if (request.getFileSize() > 50 * 1024 * 1024) {
            throw new IllegalArgumentException("文件大小不能超过 50MB（MVP 限制）");
        }

        var existingDoc = docRepository.findByTenantIdAndSha256(request.getTenantId(), request.getFileHash());
        if (existingDoc.isPresent()) {
            if (Boolean.TRUE.equals(request.getOverwriteExisting())) {
                throw new UnsupportedOperationException("PHASE2_PLACEHOLDER: 覆盖已有文档");
            } else {
                throw new IllegalStateException("DUPLICATE_FILE:" + existingDoc.get().getDocId());
            }
        }

        String docId = minioService.generateDocId();
        String srcPath = minioService.buildObjectPath(
                request.getTenantId(), request.getBizDomain(), docId, request.getFilename());
        String presignedUrl = minioService.generatePresignedUrl(
                request.getTenantId(), request.getBizDomain(), docId, request.getFilename());

        // 解析 chunk config
        Integer chunkSize = 512;
        Integer overlapRatio = 10;
        String chunkMode = "HEAD_FIRST";
        if (request.getChunkConfig() != null) {
            InitUploadRequest.ChunkConfigDto config = request.getChunkConfig();
            if (Boolean.FALSE.equals(config.getUseSpaceConfig())) {
                chunkSize = config.getChunkSize() != null ? config.getChunkSize() : 512;
                overlapRatio = config.getOverlapRatio() != null ? config.getOverlapRatio() : 10;
                chunkMode = config.getChunkMode() != null ? config.getChunkMode() : "HEAD_FIRST";
            }
        }

        KnowledgeDoc doc = KnowledgeDoc.builder()
                .tenantId(request.getTenantId())
                .docId(docId)
                .version(1)
                .title(request.getFilename())
                .sourceType("UPLOAD")
                .docType(request.getDocType())
                .srcPath(srcPath)
                .sha256(request.getFileHash())
                .ownerUid(request.getOwnerUid())
                .deptId(request.getDeptId())
                .secLevel(request.getSecLevel())
                .regionCode(request.getRegionCode())
                .bizDomain(request.getBizDomain())
                .effectiveFrom(request.getEffectiveFrom() != null ? LocalDate.parse(request.getEffectiveFrom()) : null)
                .status("DRAFT")
                .knowledgeSpaceId(request.getKnowledgeSpaceId())
                .chunkSize(chunkSize)
                .overlapRatio(overlapRatio)
                .chunkMode(chunkMode)
                .fileSize(request.getFileSize())
                .verified(false)
                .build();

        docRepository.save(doc);
        log.info("init-upload: created docId={}, tenantId={}, sha256={}", docId, request.getTenantId(), request.getFileHash());

        return InitUploadResponse.builder()
                .docId(docId)
                .presignedUrl(presignedUrl)
                .expireIn(300)
                .build();
    }

    @Override
    @Transactional
    public VerifyUploadResponse verifyUpload(String tenantId, String docId, Integer version) {
        KnowledgeDoc doc = findDocOrThrow(tenantId, docId, version);

        if (!"DRAFT".equals(doc.getStatus())) {
            throw new IllegalStateException("文档状态不是 DRAFT，无法验证");
        }

        boolean verified = minioService.verifyObject(doc.getSrcPath(), doc.getFileSize(), doc.getSha256());

        if (verified) {
            docRepository.markAsVerified(tenantId, docId, version);
            log.info("verify-upload: docId={} verified successfully", docId);
        } else {
            throw new IllegalStateException("文件验证失败：大小或 SHA256 不匹配");
        }

        String traceId = "tr-" + UUID.randomUUID().toString();
        return VerifyUploadResponse.builder()
                .docId(docId)
                .verified(verified)
                .traceId(traceId)
                .build();
    }

    @Override
    @Transactional
    public CommitResponse commit(String tenantId, String docId, Integer version, CommitRequest request) {
        KnowledgeDoc doc = findDocOrThrow(tenantId, docId, version);

        if (!"DRAFT".equals(doc.getStatus())) {
            throw new IllegalStateException("文档状态不是 DRAFT，无法提交");
        }

        if (!doc.getVerified()) {
            throw new IllegalStateException("文档未验证，无法提交");
        }

        for (CommitRequest.AclEntry aclEntry : request.getAcl()) {
            DocAcl acl = DocAcl.builder()
                    .tenantId(tenantId)
                    .docId(docId)
                    .accessorType(aclEntry.getAccessorType())
                    .accessorId(aclEntry.getAccessorId())
                    .permission(aclEntry.getPermission())
                    .build();
            aclRepository.save(acl);
        }

        // 创建 knowledge_version 记录（状态为 PENDING）
        KnowledgeVersion kv = KnowledgeVersion.builder()
                .tenantId(tenantId)
                .docId(docId)
                .version(version)
                .status("PENDING")
                .createdBy(doc.getOwnerUid())
                .build();
        versionRepository.save(kv);

        // 更新文档状态为 PENDING
        docRepository.updateStatus(tenantId, docId, version, "PENDING");

        log.info("commit: docId={}, version={}, status=PENDING", docId, version);

        return CommitResponse.builder()
                .docId(docId)
                .version(version)
                .status("PENDING")
                .build();
    }

    @Override
    @Transactional
    public IngestResponse ingest(String tenantId, String docId, Integer version) {
        KnowledgeDoc doc = findDocOrThrow(tenantId, docId, version);

        if (!"PENDING".equals(doc.getStatus())) {
            if ("PROCESSING".equals(doc.getStatus()) || "READY".equals(doc.getStatus())) {
                throw new IllegalStateException("文档已在处理中或已完成，无法重复触发");
            }
            throw new IllegalStateException("文档状态不是 PENDING，无法触发入库");
        }

        // 更新状态为 PROCESSING
        docRepository.updateStatus(tenantId, docId, version, "PROCESSING");

        String traceId = "tr-" + UUID.randomUUID().toString();

        // 构建 Kafka 消息（使用 HashMap 避免 Map.of() 的参数数量限制）
        Map<String, Object> chunkConfig = new HashMap<>();
        chunkConfig.put("chunkSize", doc.getChunkSize());
        chunkConfig.put("overlapRatio", doc.getOverlapRatio());
        chunkConfig.put("chunkMode", doc.getChunkMode());

        Map<String, Object> message = new HashMap<>();
        message.put("traceId", traceId);
        message.put("tenantId", tenantId);
        message.put("docId", docId);
        message.put("version", version);
        message.put("srcPath", doc.getSrcPath());
        message.put("sha256", doc.getSha256());
        message.put("secLevel", doc.getSecLevel());
        message.put("regionCode", doc.getRegionCode());
        message.put("bizDomain", doc.getBizDomain());
        message.put("docType", doc.getDocType());
        message.put("ownerUid", doc.getOwnerUid());
        message.put("deptId", doc.getDeptId());
        message.put("effectiveFrom", doc.getEffectiveFrom() != null ? doc.getEffectiveFrom().toString() : null);
        message.put("effectiveTo", doc.getEffectiveTo() != null ? doc.getEffectiveTo().toString() : null);
        message.put("knowledgeSpaceId", doc.getKnowledgeSpaceId());
        message.put("chunkConfig", chunkConfig);
        message.put("pageLimit", 30);
        message.put("ocrDisabled", true);

        kafkaTemplate.send(FILE_INGEST_TOPIC, tenantId, message);

        log.info("ingest: docId={}, version={}, sent to Kafka topic={}", docId, version, FILE_INGEST_TOPIC);

        return IngestResponse.builder()
                .docId(docId)
                .version(version)
                .status("PROCESSING")
                .message("入库任务已提交")
                .traceId(traceId)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public DocStatusResponse getStatus(String tenantId, String docId, Integer version) {
        KnowledgeDoc doc = findDocOrThrow(tenantId, docId, version);

        return DocStatusResponse.builder()
                .docId(docId)
                .version(version)
                .status(doc.getStatus())
                .retryCount(0)
                .lastError(null)
                .traceId("tr-" + UUID.randomUUID().toString())
                .build();
    }

    private KnowledgeDoc findDocOrThrow(String tenantId, String docId, Integer version) {
        return docRepository.findByTenantIdAndDocIdAndVersion(tenantId, docId, version)
                .orElseThrow(() -> new IllegalArgumentException("文档不存在: " + docId + " v" + version));
    }

    @Override
    @Transactional(readOnly = true)
    public DocListResponse listDocs(String tenantId, String spaceId) {
        List<KnowledgeDoc> docs;
        if (spaceId == null || "ALL".equals(spaceId)) {
            docs = docRepository.findByTenantIdOrderByCreateTimeDesc(tenantId);
        } else {
            docs = docRepository.findByTenantIdAndKnowledgeSpaceIdOrderByCreateTimeDesc(tenantId, spaceId);
        }

        List<DocListResponse.DocSummary> summaries = docs.stream()
                .map(doc -> DocListResponse.DocSummary.builder()
                        .docId(doc.getDocId())
                        .title(doc.getTitle())
                        .version(doc.getVersion())
                        .docType(doc.getDocType())
                        .status(doc.getStatus())
                        .secLevel(doc.getSecLevel())
                        .bizDomain(doc.getBizDomain())
                        .regionCode(doc.getRegionCode())
                        .ownerUid(doc.getOwnerUid())
                        .deptId(doc.getDeptId())
                        .effectiveFrom(doc.getEffectiveFrom() != null ? doc.getEffectiveFrom().toString() : null)
                        .effectiveTo(doc.getEffectiveTo() != null ? doc.getEffectiveTo().toString() : null)
                        .labelTags(doc.getLabelTags())
                        .srcPath(doc.getSrcPath())
                        .createTime(doc.getCreateTime() != null ? doc.getCreateTime().toString() : null)
                        .fileSize(doc.getFileSize())
                        .knowledgeSpaceId(doc.getKnowledgeSpaceId())
                        .build())
                .collect(java.util.stream.Collectors.toList());

        return DocListResponse.builder()
                .docs(summaries)
                .total(summaries.size())
                .build();
    }
}