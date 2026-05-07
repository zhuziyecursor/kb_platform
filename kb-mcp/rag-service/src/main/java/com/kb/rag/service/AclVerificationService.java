package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.MilvusSearchResult;
import com.kb.rag.entity.DocAcl;
import com.kb.rag.entity.KnowledgeVersion;
import com.kb.rag.repository.DocAclRepository;
import com.kb.rag.repository.KnowledgeVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AclVerificationService {

    private final DocAclRepository docAclRepository;
    private final KnowledgeVersionRepository knowledgeVersionRepository;

    @Transactional(readOnly = true)
    public List<CitationDto> verify(List<MilvusSearchResult> results, String tenantId,
                                     String userId, List<String> userGroups) {
        if (results.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> docIds = results.stream()
                .map(MilvusSearchResult::getDocId)
                .distinct()
                .collect(Collectors.toList());

        List<DocAcl> acls = docAclRepository.findByTenantIdAndDocIdIn(tenantId, docIds);
        List<KnowledgeVersion> versions = knowledgeVersionRepository.findByTenantIdAndDocIdIn(tenantId, docIds);

        Map<String, Set<String>> docAccessors = new HashMap<>();
        for (DocAcl acl : acls) {
            docAccessors.computeIfAbsent(acl.getDocId(), k -> new HashSet<>())
                    .add(acl.getAccessorId());
        }

        Map<String, KnowledgeVersion> latestVersion = new HashMap<>();
        Map<String, Boolean> isCurrentMap = new HashMap<>();
        for (KnowledgeVersion v : versions) {
            String key = v.getDocId();
            if (!latestVersion.containsKey(key) || v.getVersion() > latestVersion.get(key).getVersion()) {
                latestVersion.put(key, v);
            }
        }
        for (KnowledgeVersion v : versions) {
            String key = v.getDocId();
            isCurrentMap.putIfAbsent(key, "READY".equals(v.getStatus()));
        }

        List<CitationDto> citations = new ArrayList<>();
        for (MilvusSearchResult r : results) {
            Set<String> accessors = docAccessors.getOrDefault(r.getDocId(), Collections.emptySet());
            boolean hasAccess = accessors.contains(userId)
                    || userGroups.stream().anyMatch(accessors::contains);
            if (!hasAccess) {
                log.debug("ACL denied: docId={} userId={}", r.getDocId(), userId);
                continue;
            }

            boolean isCurrent = isCurrentMap.getOrDefault(r.getDocId(), false);

            citations.add(CitationDto.builder()
                    .docId(r.getDocId())
                    .chunkSeq(r.getChunkSeq())
                    .title(r.getTitle())
                    .version(r.getVersion())
                    .page(r.getPage())
                    .sectionPath(r.getSectionPath())
                    .regionCode(r.getRegionCode())
                    .effectiveFrom(r.getEffectiveFrom())
                    .effectiveTo(r.getEffectiveTo())
                    .isCurrent(isCurrent)
                    .score(r.getVectorScore())
                    .text(r.getText())
                    .build());
        }
        return citations;
    }
}
