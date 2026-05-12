package com.kb.ingest.controller;

import com.kb.ingest.dto.*;
import com.kb.ingest.config.DevContextProperties;
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
    private final DevContextProperties devContext;

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
        VerifyUploadResponse response = docService.verifyUpload(devContext.getTenantId(), docId, version);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{docId}/commit")
    public ResponseEntity<CommitResponse> commit(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version,
            @Valid @RequestBody CommitRequest request) {
        CommitResponse response = docService.commit(devContext.getTenantId(), docId, version, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{docId}/ingest")
    public ResponseEntity<IngestResponse> ingest(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        IngestResponse response = docService.ingest(devContext.getTenantId(), docId, version);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{docId}/status")
    public ResponseEntity<DocStatusResponse> getStatus(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        DocStatusResponse response = docService.getStatus(devContext.getTenantId(), docId, version);
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<DocListResponse> listDocs(
            @RequestParam(required = false) String spaceId) {
        DocListResponse response = docService.listDocs(devContext.getTenantId(), spaceId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{docId}/download")
    public ResponseEntity<InputStreamResource> getDocFile(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) throws Exception {
        DocFileResponse docFile = docService.getDocFile(devContext.getTenantId(), docId, version);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(docFile.getContentType()));
        headers.setContentDispositionFormData("inline", docFile.getFilename());

        return ResponseEntity.ok()
                .headers(headers)
                .body(new InputStreamResource(docFile.getResource().getInputStream()));
    }

    /**
     * 获取文档预览信息（presigned URL + 元数据）。
     * <p>
     * 前端拿到 previewUrl 后，可根据 previewType 选择渲染方式：
     * <ul>
     *   <li>PDF：iframe 嵌入 previewUrl#page=N&search=text</li>
     *   <li>图片：img 标签直接展示</li>
     *   <li>文本/MD：iframe 或 pre 标签展示</li>
     * </ul>
     */
    @GetMapping("/{docId}/preview")
    public ResponseEntity<DocPreviewResponse> getDocPreview(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) String highlight) {
        DocPreviewResponse response = docService.getDocPreview(
                devContext.getTenantId(), docId, version, page, highlight);
        return ResponseEntity.ok(response);
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
                    devContext.getTenantId(), docId, version,
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
        IngestResponse response = docService.retryDoc(devContext.getTenantId(), docId, version);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{docId}")
    public ResponseEntity<Void> deleteDoc(
            @PathVariable String docId,
            @RequestParam(defaultValue = "1") Integer version) {
        docService.deleteDoc(devContext.getTenantId(), docId, version);
        return ResponseEntity.noContent().build();
    }
}
