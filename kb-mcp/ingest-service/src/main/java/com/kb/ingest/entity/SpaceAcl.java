package com.kb.ingest.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "space_acl",
       schema = "kb_knowledge",
       uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "space_id", "accessor_type", "accessor_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SpaceAcl {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "space_id", length = 64, nullable = false)
    private String spaceId;

    @Column(name = "accessor_type", length = 16, nullable = false)
    private String accessorType;

    @Column(name = "accessor_id", length = 128, nullable = false)
    private String accessorId;

    @Column(name = "permission", length = 16, nullable = false)
    @Builder.Default
    private String permission = "READ";

    @Column(name = "acl_version", nullable = false)
    @Builder.Default
    private Long aclVersion = 1L;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (aclVersion == null) aclVersion = 1L;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}
