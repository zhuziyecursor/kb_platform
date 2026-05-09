package com.kb.ingest.service;

import com.kb.ingest.dto.SpaceAclEntry;
import com.kb.ingest.dto.SpaceAclResponse;
import com.kb.ingest.entity.DocAcl;
import com.kb.ingest.entity.KnowledgeDoc;
import com.kb.ingest.entity.SpaceAcl;
import com.kb.ingest.exception.SpaceNotFoundException;
import com.kb.ingest.repository.DocAclRepository;
import com.kb.ingest.repository.KnowledgeDocRepository;
import com.kb.ingest.repository.KnowledgeSpaceRepository;
import com.kb.ingest.repository.SpaceAclRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SpaceAclServiceImpl implements SpaceAclService {

    private final SpaceAclRepository spaceAclRepository;
    private final KnowledgeSpaceRepository spaceRepository;
    private final KnowledgeDocRepository docRepository;
    private final DocAclRepository docAclRepository;

    @Override
    @Transactional(readOnly = true)
    public List<SpaceAclResponse> getAllSpaceAcl(String tenantId) {
        return spaceRepository.findByTenantId(tenantId).stream()
                .map(space -> {
                    List<SpaceAclEntry> entries = spaceAclRepository
                            .findByTenantIdAndSpaceId(tenantId, space.getId())
                            .stream()
                            .map(this::toEntry)
                            .collect(Collectors.toList());
                    return SpaceAclResponse.builder()
                            .spaceId(space.getId())
                            .spaceName(space.getName())
                            .permissions(entries)
                            .build();
                })
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<SpaceAclEntry> getSpaceAcl(String tenantId, String spaceId) {
        spaceRepository.findByIdAndTenantId(spaceId, tenantId)
                .orElseThrow(() -> new SpaceNotFoundException(spaceId));

        return spaceAclRepository.findByTenantIdAndSpaceId(tenantId, spaceId)
                .stream()
                .map(this::toEntry)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void updateSpaceAcl(String tenantId, String spaceId, List<SpaceAclEntry> entries) {
        spaceRepository.findByIdAndTenantId(spaceId, tenantId)
                .orElseThrow(() -> new SpaceNotFoundException(spaceId));

        // 1. Delete existing ACL entries for this space
        spaceAclRepository.deleteByTenantIdAndSpaceId(tenantId, spaceId);

        // 2. Insert new ACL entries
        List<SpaceAcl> newAcls = new ArrayList<>();
        for (SpaceAclEntry entry : entries) {
            SpaceAcl acl = SpaceAcl.builder()
                    .tenantId(tenantId)
                    .spaceId(spaceId)
                    .accessorType(entry.getAccessorType())
                    .accessorId(entry.getAccessorId())
                    .permission(entry.getPermission() != null ? entry.getPermission() : "READ")
                    .aclVersion(1L)
                    .build();
            newAcls.add(acl);
        }
        spaceAclRepository.saveAll(newAcls);

        // 3. Cascade ROLE/DEPT entries to doc_acl for all docs in this space
        cascadeToDocs(tenantId, spaceId, entries);

        log.info("Updated space ACL: tenantId={}, spaceId={}, entries={}", tenantId, spaceId, entries.size());
    }

    private void cascadeToDocs(String tenantId, String spaceId, List<SpaceAclEntry> entries) {
        // Find all docs in this space (only ROLE and DEPT entries cascade)
        List<KnowledgeDoc> docsInSpace = docRepository.findByTenantIdAndKnowledgeSpaceIdOrderByCreateTimeDesc(tenantId, spaceId);
        if (docsInSpace.isEmpty()) {
            log.info("No docs found in space {} for cascade", spaceId);
            return;
        }

        // Get only ROLE and DEPT entries (USER entries are handled via user-role relationship at query time)
        List<SpaceAclEntry> cascadableEntries = entries.stream()
                .filter(e -> "ROLE".equals(e.getAccessorType()) || "DEPT".equals(e.getAccessorType()))
                .collect(Collectors.toList());

        if (cascadableEntries.isEmpty()) {
            // No ROLE/DEPT entries - clear existing cascade ACLs for this space's docs
            for (KnowledgeDoc doc : docsInSpace) {
                docAclRepository.deleteByTenantIdAndDocId(tenantId, doc.getDocId());
            }
            log.info("Cleared doc ACLs for {} docs in space {} (no ROLE/DEPT bindings)", docsInSpace.size(), spaceId);
            return;
        }

        // For each doc, upsert cascade ACL entries
        for (KnowledgeDoc doc : docsInSpace) {
            // Clear existing cascade ACLs for this doc (ROLE/DEPT only)
            List<DocAcl> existingAcls = docAclRepository.findByTenantIdAndDocId(tenantId, doc.getDocId());
            for (DocAcl existing : existingAcls) {
                if ("ROLE".equals(existing.getAccessorType()) || "DEPT".equals(existing.getAccessorType())) {
                    docAclRepository.delete(existing);
                }
            }

            // Insert new cascade ACLs
            List<DocAcl> newDocAcls = new ArrayList<>();
            for (SpaceAclEntry entry : cascadableEntries) {
                DocAcl docAcl = DocAcl.builder()
                        .tenantId(tenantId)
                        .docId(doc.getDocId())
                        .accessorType(entry.getAccessorType())
                        .accessorId(entry.getAccessorId())
                        .permission(entry.getPermission() != null ? entry.getPermission() : "READ")
                        .aclVersion(1L)
                        .build();
                newDocAcls.add(docAcl);
            }
            docAclRepository.saveAll(newDocAcls);
        }

        log.info("Cascaded {} ROLE/DEPT ACL entries to {} docs in space {}",
                cascadableEntries.size(), docsInSpace.size(), spaceId);
    }

    private SpaceAclEntry toEntry(SpaceAcl acl) {
        return SpaceAclEntry.builder()
                .accessorType(acl.getAccessorType())
                .accessorId(acl.getAccessorId())
                .permission(acl.getPermission())
                .build();
    }
}
