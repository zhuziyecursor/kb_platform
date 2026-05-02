package com.kb.vector.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "embed_task", schema = "kb_knowledge",
       uniqueConstraints = @UniqueConstraint(columnNames = {
           "tenant_id", "doc_id", "version", "chunk_seq", "text_hash"
       }))
public class EmbedTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "doc_id", nullable = false, length = 128)
    private String docId;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "chunk_seq", nullable = false)
    private Integer chunkSeq;

    @Column(name = "text_hash", nullable = false, length = 64)
    private String textHash;

    @Column(name = "title", length = 256)
    private String title;

    @Column(name = "section_path", length = 256)
    private String sectionPath;

    @Column(name = "page")
    private Integer page;

    @Column(name = "dept_id", length = 64)
    private String deptId;

    @Column(name = "sec_level", nullable = false)
    private Integer secLevel = 1;

    @Column(name = "region_code", nullable = false, length = 32)
    private String regionCode = "CN-NATIONAL";

    @Column(name = "biz_domain", nullable = false, length = 64)
    private String bizDomain = "COMPLIANCE";

    @Column(name = "perm_group_id")
    private Long permGroupId;

    @Column(name = "acl_version", nullable = false)
    private Long aclVersion = 1L;

    @Column(name = "status", nullable = false, length = 16)
    private String status = "PENDING";

    @Column(name = "milvus_pk")
    private Long milvusPk;

    @Column(name = "milvus_version")
    private Long milvusVersion;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount = 0;

    @Column(name = "max_retries", nullable = false)
    private Integer maxRetries = 3;

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "error_msg")
    private String errorMsg;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;
}
