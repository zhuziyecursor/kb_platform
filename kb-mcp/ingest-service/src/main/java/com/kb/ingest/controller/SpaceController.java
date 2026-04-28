package com.kb.ingest.controller;

import com.kb.ingest.dto.CreateSpaceRequest;
import com.kb.ingest.dto.SpaceResponse;
import com.kb.ingest.dto.UpdateSpaceRequest;
import com.kb.ingest.service.SpaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/kb/v1/spaces")
@RequiredArgsConstructor
public class SpaceController {

    private final SpaceService spaceService;

    // TODO: PHASE2 权限开发时，从 JWT token 解析 tenant_id
    private static final String DEV_TENANT_ID = "dev-tenant-001";

    @GetMapping
    public ResponseEntity<Map<String, List<SpaceResponse>>> listSpaces() {
        List<SpaceResponse> spaces = spaceService.listSpaces(DEV_TENANT_ID);
        return ResponseEntity.ok(Map.of("spaces", spaces));
    }

    @GetMapping("/{spaceId}")
    public ResponseEntity<SpaceResponse> getSpace(@PathVariable String spaceId) {
        SpaceResponse space = spaceService.getSpace(DEV_TENANT_ID, spaceId);
        return ResponseEntity.ok(space);
    }

    @PostMapping
    public ResponseEntity<SpaceResponse> createSpace(@Valid @RequestBody CreateSpaceRequest request) {
        SpaceResponse space = spaceService.createSpace(DEV_TENANT_ID, request);
        return ResponseEntity.ok(space);
    }

    @PutMapping("/{spaceId}")
    public ResponseEntity<SpaceResponse> updateSpace(
            @PathVariable String spaceId,
            @Valid @RequestBody UpdateSpaceRequest request) {
        SpaceResponse space = spaceService.updateSpace(DEV_TENANT_ID, spaceId, request);
        return ResponseEntity.ok(space);
    }

    @DeleteMapping("/{spaceId}")
    public ResponseEntity<Void> deleteSpace(@PathVariable String spaceId) {
        spaceService.deleteSpace(DEV_TENANT_ID, spaceId);
        return ResponseEntity.ok().build();
    }
}