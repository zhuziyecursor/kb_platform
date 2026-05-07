package com.kb.ingest.service;

import com.kb.ingest.dto.*;

public interface DocService {

    InitUploadResponse initUpload(InitUploadRequest request);

    VerifyUploadResponse verifyUpload(String tenantId, String docId, Integer version);

    CommitResponse commit(String tenantId, String docId, Integer version, CommitRequest request);

    IngestResponse ingest(String tenantId, String docId, Integer version);

    DocStatusResponse getStatus(String tenantId, String docId, Integer version);

    DocListResponse listDocs(String tenantId, String spaceId);

    DocFileResponse getDocFile(String tenantId, String docId, Integer version);

    UploadResponse uploadFile(String tenantId, String docId, Integer version, byte[] fileData, String filename, String contentType);

    void deleteDoc(String tenantId, String docId, Integer version);

    IngestResponse retryDoc(String tenantId, String docId, Integer version);
}