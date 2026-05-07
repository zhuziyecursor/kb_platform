package com.kb.ingest.controller;

import com.kb.ingest.dto.*;
import com.kb.ingest.service.DocService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

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

    @GetMapping("/{docId}/download")
    public ResponseEntity<InputStreamResource> getDocFile(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) throws Exception {
        DocFileResponse docFile = docService.getDocFile(DEV_TENANT_ID, docId, version);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(docFile.getContentType()));
        headers.setContentDispositionFormData("inline", docFile.getFilename());

        return ResponseEntity.ok()
                .headers(headers)
                .body(new InputStreamResource(docFile.getResource().getInputStream()));
    }

    @PostMapping("/{docId}/upload")
    public ResponseEntity<UploadResponse> uploadFile(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version,
            @RequestParam("file") MultipartFile file) {
        try {
            byte[] fileData;
            try {
                fileData = file.getBytes();
            } catch (Exception e) {
                log.error("Failed to read file data for docId: {}", docId, e);
                return ResponseEntity.badRequest()
                        .body(UploadResponse.builder()
                                .docId(docId)
                                .success(false)
                                .message("读取文件失败: " + e.getMessage())
                                .build());
            }
            UploadResponse response = docService.uploadFile(
                    DEV_TENANT_ID, docId, version,
                    fileData, file.getOriginalFilename(), file.getContentType());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to upload file for docId: {}", docId, e);
            return ResponseEntity.internalServerError()
                    .body(UploadResponse.builder()
                            .docId(docId)
                            .success(false)
                            .message("上传失败: " + e.getMessage())
                            .build());
        }
    }

    @PostMapping("/{docId}/retry")
    public ResponseEntity<IngestResponse> retryDoc(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        IngestResponse response = docService.retryDoc(DEV_TENANT_ID, docId, version);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{docId}")
    public ResponseEntity<Void> deleteDoc(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        docService.deleteDoc(DEV_TENANT_ID, docId, version);
        return ResponseEntity.noContent().build();
    }
}