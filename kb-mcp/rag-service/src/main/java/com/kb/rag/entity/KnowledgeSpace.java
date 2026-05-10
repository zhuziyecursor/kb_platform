package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "knowledge_space", schema = "kb_knowledge")
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

    @Column(name = "parent_id", length = 64)
    private String parentId;

    @Column(name = "node_path", columnDefinition = "TEXT", nullable = false)
    private String nodePath;

    @Column(name = "depth", nullable = false)
    private int depth;
}
