package com.kb.publicapi.controller;

import com.kb.publicapi.dto.DocStatusResponse;
import com.kb.publicapi.dto.FileIngestResponse;
import com.kb.publicapi.service.FileIngestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@RestController
@RequestMapping("/openapi/v1/kb")
@RequiredArgsConstructor
public class FileIngestController {

    private final FileIngestService fileIngestService;

    @PostMapping(value = "/files/ingest", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileIngestResponse> ingestFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "filename", required = false) String filename,
            @RequestParam(value = "docType", required = false) String docType,
            @RequestParam(value = "bizDomain", required = false) String bizDomain,
            @RequestParam(value = "regionCode", required = false) String regionCode,
            @RequestParam(value = "spaceId", required = false) String spaceId,
            @RequestParam(value = "tags", required = false) String tags,
            @RequestParam(value = "acl", required = false) String aclJson,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {

        try {
            byte[] fileBytes = file.getBytes();
            String resolvedFilename = filename != null ? filename : file.getOriginalFilename();

            FileIngestResponse response = fileIngestService.ingest(
                    fileBytes,
                    resolvedFilename != null ? resolvedFilename : "unnamed",
                    file.getContentType(),
                    docType,
                    bizDomain,
                    regionCode,
                    spaceId,
                    aclJson,
                    tags,
                    idempotencyKey);

            return ResponseEntity.accepted().body(response);
        } catch (Exception e) {
            log.error("Failed to read uploaded file", e);
            throw new RuntimeException("读取上传文件失败: " + e.getMessage());
        }
    }

    @GetMapping("/files/{docId}/status")
    public ResponseEntity<DocStatusResponse> getDocStatus(@PathVariable String docId) {
        DocStatusResponse response = fileIngestService.getStatus(docId);
        return ResponseEntity.ok(response);
    }
}
