package com.kb.ingest.controller;

import com.kb.ingest.dto.*;
import com.kb.ingest.service.DocService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/kb/v1/docs")
@RequiredArgsConstructor
public class DocController {

    private final DocService docService;

    private static final String DEV_TENANT_ID = "dev-tenant-001";
    private static final Integer DEFAULT_VERSION = 1;

    @PostMapping("/init-upload")
    public ResponseEntity<InitUploadResponse> initUpload(@Valid @RequestBody InitUploadRequest request) {
        InitUploadResponse response = docService.initUpload(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{docId}/verify-upload")
    public ResponseEntity<VerifyUploadResponse> verifyUpload(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        VerifyUploadResponse response = docService.verifyUpload(DEV_TENANT_ID, docId, version);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{docId}/commit")
    public ResponseEntity<CommitResponse> commit(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version,
            @Valid @RequestBody CommitRequest request) {
        CommitResponse response = docService.commit(DEV_TENANT_ID, docId, version, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{docId}/ingest")
    public ResponseEntity<IngestResponse> ingest(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        IngestResponse response = docService.ingest(DEV_TENANT_ID, docId, version);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{docId}/status")
    public ResponseEntity<DocStatusResponse> getStatus(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        DocStatusResponse response = docService.getStatus(DEV_TENANT_ID, docId, version);
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<DocListResponse> listDocs(
            @RequestParam(required = false) String spaceId) {
        DocListResponse response = docService.listDocs(DEV_TENANT_ID, spaceId);
        return ResponseEntity.ok(response);
    }
}