package com.kb.ingest.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "knowledge_space",
       schema = "kb_knowledge",
       uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "name"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeSpace {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 128, nullable = false)
    private String name;

    @Column(name = "description", length = 512)
    private String description;

    @Column(name = "chunk_size", nullable = false)
    @Builder.Default
    private Integer chunkSize = 512;

    @Column(name = "overlap_ratio", nullable = false)
    @Builder.Default
    private Integer overlapRatio = 10;

    @Column(name = "chunk_mode", length = 16, nullable = false)
    @Builder.Default
    private String chunkMode = "HEAD_FIRST";

    @Column(name = "visibility", length = 16, nullable = false)
    @Builder.Default
    private String visibility = "TEAM";

    @Column(name = "parent_id", length = 64)
    private String parentId;

    @Column(name = "node_path", length = 1024, nullable = false)
    @Builder.Default
    private String nodePath = "/";

    @Column(name = "depth", nullable = false)
    @Builder.Default
    private Integer depth = 0;

    @Column(name = "create_time", nullable = false)
    @Builder.Default
    private LocalDateTime createTime = LocalDateTime.now();

    @Column(name = "update_time", nullable = false)
    @Builder.Default
    private LocalDateTime updateTime = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        this.updateTime = LocalDateTime.now();
    }
}