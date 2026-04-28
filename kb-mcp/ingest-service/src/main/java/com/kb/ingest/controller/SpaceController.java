package com.kb.ingest.controller;

import com.kb.ingest.dto.CreateSpaceRequest;
import com.kb.ingest.dto.SpaceResponse;
import com.kb.ingest.dto.UpdateSpaceRequest;
import com.kb.ingest.service.SpaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/kb/v1/spaces")
@RequiredArgsConstructor
public class SpaceController {

    private final SpaceService spaceService;

    @GetMapping
    public ResponseEntity<Map<String, List<SpaceResponse>>> listSpaces(@AuthenticationPrincipal Jwt jwt) {
        String tenantId = jwt.getClaimAsString("tenant_id");
        List<SpaceResponse> spaces = spaceService.listSpaces(tenantId);
        return ResponseEntity.ok(Map.of("spaces", spaces));
    }

    @GetMapping("/{spaceId}")
    public ResponseEntity<SpaceResponse> getSpace(
            @PathVariable String spaceId,
            @AuthenticationPrincipal Jwt jwt) {
        String tenantId = jwt.getClaimAsString("tenant_id");
        SpaceResponse space = spaceService.getSpace(tenantId, spaceId);
        return ResponseEntity.ok(space);
    }

    @PostMapping
    public ResponseEntity<SpaceResponse> createSpace(
            @Valid @RequestBody CreateSpaceRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String tenantId = jwt.getClaimAsString("tenant_id");
        SpaceResponse space = spaceService.createSpace(tenantId, request);
        return ResponseEntity.ok(space);
    }

    @PutMapping("/{spaceId}")
    public ResponseEntity<SpaceResponse> updateSpace(
            @PathVariable String spaceId,
            @Valid @RequestBody UpdateSpaceRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String tenantId = jwt.getClaimAsString("tenant_id");
        SpaceResponse space = spaceService.updateSpace(tenantId, spaceId, request);
        return ResponseEntity.ok(space);
    }

    @DeleteMapping("/{spaceId}")
    public ResponseEntity<Void> deleteSpace(
            @PathVariable String spaceId,
            @AuthenticationPrincipal Jwt jwt) {
        String tenantId = jwt.getClaimAsString("tenant_id");
        spaceService.deleteSpace(tenantId, spaceId);
        return ResponseEntity.ok().build();
    }
}