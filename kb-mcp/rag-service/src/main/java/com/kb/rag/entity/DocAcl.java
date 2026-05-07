package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "doc_acl", schema = "kb_knowledge",
       uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "doc_id", "accessor_type", "accessor_id"}))
public class DocAcl {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "doc_id", length = 128, nullable = false)
    private String docId;

    @Column(name = "accessor_type", length = 16, nullable = false)
    private String accessorType;

    @Column(name = "accessor_id", length = 128, nullable = false)
    private String accessorId;

    @Column(name = "permission", length = 16, nullable = false)
    private String permission;

    @Column(name = "acl_version", nullable = false)
    private Long aclVersion;
}
