package com.kb.publicapi.service;

import com.kb.publicapi.dto.DocStatusResponse;
import com.kb.publicapi.dto.FileIngestResponse;

public interface FileIngestService {

    FileIngestResponse ingest(byte[] fileBytes, String filename, String contentType,
                              String docType, String bizDomain, String regionCode,
                              String knowledgeSpaceId, String aclJson, String labelTags,
                              String idempotencyKey);

    DocStatusResponse getStatus(String docId);
}
