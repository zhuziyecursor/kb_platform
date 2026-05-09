package com.kb.ingest.service;

import com.kb.ingest.dto.SpaceAclEntry;
import com.kb.ingest.dto.SpaceAclResponse;

import java.util.List;

public interface SpaceAclService {

    List<SpaceAclResponse> getAllSpaceAcl(String tenantId);

    List<SpaceAclEntry> getSpaceAcl(String tenantId, String spaceId);

    void updateSpaceAcl(String tenantId, String spaceId, List<SpaceAclEntry> entries);
}
