package com.kb.ingest.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "knowledge_doc",
       schema = "kb_knowledge",
       uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "doc_id", "version"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeDoc {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "doc_id", length = 128, nullable = false)
    private String docId;

    @Column(name = "version", nullable = false)
    @Builder.Default
    private Integer version = 1;

    @Column(name = "title", length = 256)
    private String title;

    @Column(name = "source_type", length = 32, nullable = false)
    @Builder.Default
    private String sourceType = "UPLOAD";

    @Column(name = "doc_type", length = 32, nullable = false)
    private String docType;

    @Column(name = "src_path", length = 512, nullable = false)
    private String srcPath;

    @Column(name = "sha256", length = 64, nullable = false)
    private String sha256;

    @Column(name = "owner_uid", length = 64)
    private String ownerUid;

    @Column(name = "dept_id", length = 64)
    private String deptId;

    @Column(name = "sec_level", nullable = false)
    @Builder.Default
    private Integer secLevel = 1;

    @Column(name = "region_code", length = 32, nullable = false)
    @Builder.Default
    private String regionCode = "CN-NATIONAL";

    @Column(name = "biz_domain", length = 64, nullable = false)
    @Builder.Default
    private String bizDomain = "COMPLIANCE";

    @Column(name = "effective_from")
    private LocalDate effectiveFrom;

    @Column(name = "effective_to")
    private LocalDate effectiveTo;

    @Column(name = "label_tags", columnDefinition = "TEXT")
    private String labelTags;

    @Column(name = "status", length = 16, nullable = false)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "create_time", nullable = false)
    @Builder.Default
    private LocalDateTime createTime = LocalDateTime.now();

    @Column(name = "expire_time")
    private LocalDateTime expireTime;

    @Column(name = "knowledge_space_id", length = 64)
    @Builder.Default
    private String knowledgeSpaceId = "DEFAULT";

    @Column(name = "chunk_size")
    @Builder.Default
    private Integer chunkSize = 512;

    @Column(name = "overlap_ratio")
    @Builder.Default
    private Integer overlapRatio = 10;

    @Column(name = "chunk_mode", length = 16)
    @Builder.Default
    private String chunkMode = "HEAD_FIRST";

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "verified", nullable = false)
    @Builder.Default
    private Boolean verified = false;
}