package com.kb.ingest.controller;

import com.kb.ingest.config.DevContextProperties;
import com.kb.ingest.dto.SpaceAclEntry;
import com.kb.ingest.dto.SpaceAclResponse;
import com.kb.ingest.dto.UpdateSpaceAclRequest;
import com.kb.ingest.service.SpaceAclService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/kb/v1/space-acl")
@RequiredArgsConstructor
public class SpaceAclController {

    private final SpaceAclService spaceAclService;
    private final DevContextProperties devContext;

    /**
     * 获取所有知识空间的权限配置
     */
    @GetMapping
    public ResponseEntity<List<SpaceAclResponse>> getAllSpaceAcl() {
        List<SpaceAclResponse> result = spaceAclService.getAllSpaceAcl(devContext.getTenantId());
        return ResponseEntity.ok(result);
    }

    /**
     * 获取指定知识空间的权限配置
     */
    @GetMapping("/{spaceId}")
    public ResponseEntity<List<SpaceAclEntry>> getSpaceAcl(@PathVariable String spaceId) {
        List<SpaceAclEntry> result = spaceAclService.getSpaceAcl(devContext.getTenantId(), spaceId);
        return ResponseEntity.ok(result);
    }

    /**
     * 更新指定知识空间的权限配置
     * 会自动级联更新该空间下所有文档的 doc_acl 表
     */
    @PutMapping("/{spaceId}")
    public ResponseEntity<Void> updateSpaceAcl(
            @PathVariable String spaceId,
            @RequestBody UpdateSpaceAclRequest request) {
        spaceAclService.updateSpaceAcl(devContext.getTenantId(), spaceId, request.getPermissions());
        return ResponseEntity.ok().build();
    }
}
