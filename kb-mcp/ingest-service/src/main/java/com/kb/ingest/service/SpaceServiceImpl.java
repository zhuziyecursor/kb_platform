package com.kb.ingest.service;

import com.kb.ingest.dto.CreateSpaceRequest;
import com.kb.ingest.dto.SpaceResponse;
import com.kb.ingest.dto.UpdateSpaceRequest;
import com.kb.ingest.entity.KnowledgeSpace;
import com.kb.ingest.exception.SpaceNotFoundException;
import com.kb.ingest.exception.SpaceNotEmptyException;
import com.kb.ingest.repository.KnowledgeSpaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SpaceServiceImpl implements SpaceService {

    private final KnowledgeSpaceRepository spaceRepository;

    @Override
    @Transactional(readOnly = true)
    public List<SpaceResponse> listSpaces(String tenantId) {
        return spaceRepository.findByTenantId(tenantId)
                .stream()
                .map(space -> SpaceResponse.fromEntity(space, spaceRepository.countDocsInSpace(tenantId, space.getId())))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public SpaceResponse getSpace(String tenantId, String spaceId) {
        KnowledgeSpace space = findSpaceOrThrow(tenantId, spaceId);
        return SpaceResponse.fromEntity(space, spaceRepository.countDocsInSpace(tenantId, spaceId));
    }

    @Override
    @Transactional
    public SpaceResponse createSpace(String tenantId, CreateSpaceRequest request) {
        KnowledgeSpace space = KnowledgeSpace.builder()
                .id(UUID.randomUUID().toString().replace("-", ""))
                .tenantId(tenantId)
                .name(request.getName())
                .description(request.getDescription())
                .chunkSize(request.getChunkSize())
                .overlapRatio(request.getOverlapRatio())
                .chunkMode(request.getChunkMode())
                .visibility(request.getVisibility())
                .build();

        KnowledgeSpace saved = spaceRepository.save(space);
        return SpaceResponse.fromEntity(saved, 0L);
    }

    @Override
    @Transactional
    public SpaceResponse updateSpace(String tenantId, String spaceId, UpdateSpaceRequest request) {
        KnowledgeSpace space = findSpaceOrThrow(tenantId, spaceId);

        if (request.getName() != null) {
            space.setName(request.getName());
        }
        if (request.getDescription() != null) {
            space.setDescription(request.getDescription());
        }
        if (request.getChunkSize() != null) {
            space.setChunkSize(request.getChunkSize());
        }
        if (request.getOverlapRatio() != null) {
            space.setOverlapRatio(request.getOverlapRatio());
        }
        if (request.getChunkMode() != null) {
            space.setChunkMode(request.getChunkMode());
        }
        if (request.getVisibility() != null) {
            space.setVisibility(request.getVisibility());
        }

        KnowledgeSpace updated = spaceRepository.save(space);
        return SpaceResponse.fromEntity(updated, spaceRepository.countDocsInSpace(tenantId, spaceId));
    }

    @Override
    @Transactional
    public void deleteSpace(String tenantId, String spaceId) {
        KnowledgeSpace space = findSpaceOrThrow(tenantId, spaceId);

        Long docCount = spaceRepository.countDocsInSpace(tenantId, spaceId);
        if (docCount > 0) {
            throw new SpaceNotEmptyException(spaceId);
        }

        spaceRepository.delete(space);
    }

    private KnowledgeSpace findSpaceOrThrow(String tenantId, String spaceId) {
        return spaceRepository.findByIdAndTenantId(spaceId, tenantId)
                .orElseThrow(() -> new SpaceNotFoundException(spaceId));
    }
}