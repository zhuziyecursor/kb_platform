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

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SpaceServiceImpl implements SpaceService {

    private final KnowledgeSpaceRepository spaceRepository;

    private static final int MAX_DEPTH = 10;

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
        String parentId = request.getParentId();
        Integer depth = 0;
        String nodePath = "/";

        if (parentId != null && !parentId.isBlank()) {
            KnowledgeSpace parent = findSpaceOrThrow(tenantId, parentId);
            depth = parent.getDepth() + 1;
            if (depth >= MAX_DEPTH) {
                throw new IllegalArgumentException("层级深度不能超过" + MAX_DEPTH + "层");
            }
            nodePath = parent.getNodePath() + parent.getId() + "/";
        }

        String spaceId = UUID.randomUUID().toString().replace("-", "");
        KnowledgeSpace space = KnowledgeSpace.builder()
                .id(spaceId)
                .tenantId(tenantId)
                .name(request.getName())
                .description(request.getDescription())
                .chunkSize(request.getChunkSize())
                .overlapRatio(request.getOverlapRatio())
                .chunkMode(request.getChunkMode())
                .visibility(request.getVisibility())
                .parentId(parentId)
                .depth(depth)
                .nodePath(nodePath)
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

        String pathPrefix = space.getNodePath() + spaceId + "/";
        Long subtreeDocCount = spaceRepository.countDocsInSubtree(tenantId, spaceId, pathPrefix);
        if (subtreeDocCount > 0) {
            throw new SpaceNotEmptyException(spaceId,
                    "该空间及其子空间共有 " + subtreeDocCount + " 篇文档，请先清空后再删除");
        }

        spaceRepository.deleteSubtree(tenantId, spaceId, pathPrefix);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SpaceResponse.SpaceTreeNode> getSpaceTree(String tenantId) {
        List<KnowledgeSpace> allSpaces = spaceRepository.findByTenantId(tenantId);

        // 按 parentId 分组
        Map<String, List<KnowledgeSpace>> childrenMap = new HashMap<>();
        List<KnowledgeSpace> roots = new ArrayList<>();

        for (KnowledgeSpace space : allSpaces) {
            if (space.getParentId() == null || space.getParentId().isBlank()) {
                roots.add(space);
            } else {
                childrenMap.computeIfAbsent(space.getParentId(), k -> new ArrayList<>()).add(space);
            }
        }

        // 计算每个空间的文档数（一次性查询所有，然后在内存中映射）
        Map<String, Long> docCountMap = new HashMap<>();
        for (KnowledgeSpace space : allSpaces) {
            docCountMap.put(space.getId(), spaceRepository.countDocsInSpace(tenantId, space.getId()));
        }

        // 递归构建树
        return roots.stream()
                .map(root -> buildTreeNode(root, childrenMap, docCountMap))
                .collect(Collectors.toList());
    }

    private SpaceResponse.SpaceTreeNode buildTreeNode(
            KnowledgeSpace space,
            Map<String, List<KnowledgeSpace>> childrenMap,
            Map<String, Long> docCountMap) {
        SpaceResponse.SpaceTreeNode node = SpaceResponse.SpaceTreeNode.fromEntity(
                space, docCountMap.getOrDefault(space.getId(), 0L));
        List<KnowledgeSpace> children = childrenMap.getOrDefault(space.getId(), Collections.emptyList());
        node.setChildren(children.stream()
                .map(child -> buildTreeNode(child, childrenMap, docCountMap))
                .collect(Collectors.toList()));
        return node;
    }

    private KnowledgeSpace findSpaceOrThrow(String tenantId, String spaceId) {
        return spaceRepository.findByIdAndTenantId(spaceId, tenantId)
                .orElseThrow(() -> new SpaceNotFoundException(spaceId));
    }
}
