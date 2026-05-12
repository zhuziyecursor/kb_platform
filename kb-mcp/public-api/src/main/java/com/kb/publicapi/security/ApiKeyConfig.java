package com.kb.publicapi.security;

public record ApiKeyConfig(
        String tenantId,
        String userId,
        String ownerUid,
        String deptId,
        int secLevel) {
}
