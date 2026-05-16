package com.kb.rag.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.dto.CreateDatasetRequest;
import com.kb.rag.dto.DatasetResponse;
import com.kb.rag.dto.QaPairResponse;
import com.kb.rag.entity.EvalDataset;
import com.kb.rag.entity.EvalQaPair;
import com.kb.rag.repository.EvalDatasetRepository;
import com.kb.rag.repository.EvalQaPairRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EvalDatasetService {

    private final EvalDatasetRepository datasetRepo;
    private final EvalQaPairRepository qaPairRepo;
    private final ObjectMapper objectMapper;

    @Transactional
    public DatasetResponse createDataset(CreateDatasetRequest request) {
        String datasetId = "ds-" + UUID.randomUUID().toString().substring(0, 8);
        EvalDataset ds = EvalDataset.builder()
                .datasetId(datasetId)
                .tenantId(request.getTenantId() != null ? request.getTenantId() : "default")
                .name(request.getName())
                .description(request.getDescription())
                .sourceType(request.getSourceType())
                .sourcePath(request.getSourcePath())
                .qaConfig(toJson(request.getQaConfig()))
                .build();
        ds = datasetRepo.save(ds);
        log.info("Created dataset {} (id={})", ds.getName(), datasetId);
        return toResponse(ds);
    }

    public DatasetResponse getDataset(String datasetId) {
        EvalDataset ds = datasetRepo.findByDatasetId(datasetId)
                .orElseThrow(() -> new NoSuchElementException("Dataset not found: " + datasetId));
        return toResponse(ds);
    }

    public Map<String, Object> listDatasets(String tenantId, int page, int size) {
        Page<EvalDataset> result = datasetRepo.findByTenantIdOrderByCreatedAtDesc(tenantId, PageRequest.of(page, size));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", result.getContent().stream().map(this::toResponse).collect(Collectors.toList()));
        body.put("total", result.getTotalElements());
        body.put("page", result.getNumber());
        body.put("size", result.getSize());
        return body;
    }

    @Transactional
    public void updateStatus(String datasetId, String status, Map<String, Object> progress) {
        EvalDataset ds = datasetRepo.findByDatasetId(datasetId)
                .orElseThrow(() -> new NoSuchElementException("Dataset not found: " + datasetId));
        ds.setStatus(status);
        if (progress != null) {
            ds.setProgress(toJson(progress));
        }
        datasetRepo.save(ds);
    }

    @Transactional
    public void updateProgress(String datasetId, String status, int totalChunks, int totalQaPairs, Map<String, Object> progress) {
        EvalDataset ds = datasetRepo.findByDatasetId(datasetId)
                .orElseThrow(() -> new NoSuchElementException("Dataset not found: " + datasetId));
        ds.setStatus(status);
        if (totalChunks > 0) ds.setTotalChunks(totalChunks);
        if (totalQaPairs > 0) ds.setTotalQaPairs(totalQaPairs);
        if (progress != null) ds.setProgress(toJson(progress));
        datasetRepo.save(ds);
    }

    @Transactional
    public void deleteDataset(String datasetId) {
        qaPairRepo.deleteByDatasetId(datasetId);
        datasetRepo.deleteByDatasetId(datasetId);
        log.info("Deleted dataset {}", datasetId);
    }

    public Map<String, Object> listQaPairs(String datasetId, String qaType, String difficulty, int page, int size) {
        Page<EvalQaPair> result = qaPairRepo.findByDatasetIdWithFilters(datasetId, qaType, difficulty, PageRequest.of(page, size));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", result.getContent().stream().map(this::toQaResponse).collect(Collectors.toList()));
        body.put("total", result.getTotalElements());
        body.put("page", result.getNumber());
        body.put("size", result.getSize());
        return body;
    }

    @Transactional
    public void saveQaPairs(List<EvalQaPair> pairs) {
        qaPairRepo.saveAll(pairs);
    }

    private DatasetResponse toResponse(EvalDataset ds) {
        return DatasetResponse.builder()
                .datasetId(ds.getDatasetId())
                .tenantId(ds.getTenantId())
                .name(ds.getName())
                .description(ds.getDescription())
                .sourceType(ds.getSourceType())
                .sourcePath(ds.getSourcePath())
                .fileCount(ds.getFileCount())
                .totalChunks(ds.getTotalChunks())
                .totalQaPairs(ds.getTotalQaPairs())
                .qaConfig(fromJson(ds.getQaConfig()))
                .status(ds.getStatus())
                .progress(fromJson(ds.getProgress()))
                .traceId(ds.getTraceId())
                .createdAt(ds.getCreatedAt())
                .updatedAt(ds.getUpdatedAt())
                .build();
    }

    private QaPairResponse toQaResponse(EvalQaPair pair) {
        return QaPairResponse.builder()
                .pairId(pair.getPairId())
                .datasetId(pair.getDatasetId())
                .question(pair.getQuestion())
                .answer(pair.getAnswer())
                .qaType(pair.getQaType())
                .sourceChunkIds(pair.getSourceChunkIds())
                .sourceDocPath(pair.getSourceDocPath())
                .difficulty(pair.getDifficulty())
                .tags(pair.getTags())
                .metadata(fromJson(pair.getMetadata()))
                .createdAt(pair.getCreatedAt())
                .build();
    }

    private String toJson(Object obj) {
        try {
            return obj != null ? objectMapper.writeValueAsString(obj) : "{}";
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fromJson(String json) {
        try {
            return json != null ? objectMapper.readValue(json, Map.class) : new HashMap<>();
        } catch (Exception e) {
            return new HashMap<>();
        }
    }
}
