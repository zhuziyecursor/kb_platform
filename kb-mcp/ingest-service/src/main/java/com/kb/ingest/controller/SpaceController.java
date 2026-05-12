package com.kb.ingest.controller;

import com.kb.ingest.config.DevContextProperties;
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
    private final DevContextProperties devContext;

    @GetMapping
    public ResponseEntity<Map<String, List<SpaceResponse>>> listSpaces() {
        List<SpaceResponse> spaces = spaceService.listSpaces(devContext.getTenantId());
        return ResponseEntity.ok(Map.of("spaces", spaces));
    }

    @GetMapping("/tree")
    public ResponseEntity<List<SpaceResponse.SpaceTreeNode>> getSpaceTree() {
        List<SpaceResponse.SpaceTreeNode> tree = spaceService.getSpaceTree(devContext.getTenantId());
        return ResponseEntity.ok(tree);
    }

    @GetMapping("/{spaceId}")
    public ResponseEntity<SpaceResponse> getSpace(@PathVariable String spaceId) {
        SpaceResponse space = spaceService.getSpace(devContext.getTenantId(), spaceId);
        return ResponseEntity.ok(space);
    }

    @PostMapping
    public ResponseEntity<SpaceResponse> createSpace(@Valid @RequestBody CreateSpaceRequest request) {
        SpaceResponse space = spaceService.createSpace(devContext.getTenantId(), request);
        return ResponseEntity.ok(space);
    }

    @PutMapping("/{spaceId}")
    public ResponseEntity<SpaceResponse> updateSpace(
            @PathVariable String spaceId,
            @Valid @RequestBody UpdateSpaceRequest request) {
        SpaceResponse space = spaceService.updateSpace(devContext.getTenantId(), spaceId, request);
        return ResponseEntity.ok(space);
    }

    @DeleteMapping("/{spaceId}")
    public ResponseEntity<Void> deleteSpace(@PathVariable String spaceId) {
        spaceService.deleteSpace(devContext.getTenantId(), spaceId);
        return ResponseEntity.ok().build();
    }
}
