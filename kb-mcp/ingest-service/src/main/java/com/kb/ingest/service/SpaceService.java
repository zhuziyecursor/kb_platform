package com.kb.ingest.service;

import com.kb.ingest.dto.CreateSpaceRequest;
import com.kb.ingest.dto.SpaceResponse;
import com.kb.ingest.dto.UpdateSpaceRequest;

import java.util.List;

public interface SpaceService {

    List<SpaceResponse> listSpaces(String tenantId);

    SpaceResponse getSpace(String tenantId, String spaceId);

    SpaceResponse createSpace(String tenantId, CreateSpaceRequest request);

    SpaceResponse updateSpace(String tenantId, String spaceId, UpdateSpaceRequest request);

    void deleteSpace(String tenantId, String spaceId);

    List<SpaceResponse.SpaceTreeNode> getSpaceTree(String tenantId);
}
