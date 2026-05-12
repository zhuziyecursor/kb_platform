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

    /**
     * 获取文档预览信息（presigned URL + 元数据），用于引用跳转原文。
     *
     * @param tenantId  租户ID
     * @param docId     文档ID
     * @param version   版本号
     * @param page      目标页码（可选）
     * @param highlight 高亮文本（可选）
     * @return 预览响应
     */
    DocPreviewResponse getDocPreview(String tenantId, String docId, Integer version, Integer page, String highlight);

    UploadResponse uploadFile(String tenantId, String docId, Integer version, byte[] fileData, String filename, String contentType);

    void deleteDoc(String tenantId, String docId, Integer version);

    IngestResponse retryDoc(String tenantId, String docId, Integer version);
}