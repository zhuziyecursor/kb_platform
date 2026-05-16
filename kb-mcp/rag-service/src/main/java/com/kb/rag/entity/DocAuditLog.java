package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "kb_doc_audit", schema = "kb_audit")
@Data
public class DocAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ts", nullable = false)
    private Instant ts;

    @Column(name = "trace_id", length = 128)
    private String traceId;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "uid", length = 64, nullable = false)
    private String uid;

    @Column(name = "action", length = 32, nullable = false)
    private String action;

    @Column(name = "doc_id", length = 128)
    private String docId;

    @Column(name = "version")
    private Integer version;

    @Column(name = "result", length = 16, nullable = false)
    private String result;

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "error_msg", columnDefinition = "TEXT")
    private String errorMsg;

    @Column(name = "detail", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String detail;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
