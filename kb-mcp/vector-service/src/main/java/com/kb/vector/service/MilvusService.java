package com.kb.vector.service;

import com.kb.vector.dto.EmbedTaskMessage;
import io.milvus.client.MilvusServiceClient;
import io.milvus.grpc.MutationResult;
import io.milvus.param.R;
import io.milvus.param.dml.InsertParam;
import io.milvus.param.dml.UpsertParam;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MilvusService {

    private final MilvusServiceClient milvusClient;

    @Value("${milvus.collection-name}")
    private String collectionName;

    public List<Long> upsert(List<EmbedTaskMessage> messages) {
        List<InsertParam.Field> fields = new ArrayList<>();

        List<Long> ids = new ArrayList<>();
        List<String> docIds = new ArrayList<>();
        List<String> tenantIds = new ArrayList<>();
        List<Integer> versions = new ArrayList<>();
        List<Integer> chunkSeqs = new ArrayList<>();
        List<List<Float>> vectors = new ArrayList<>();
        List<String> texts = new ArrayList<>();
        List<String> titles = new ArrayList<>();
        List<String> sectionPaths = new ArrayList<>();
        List<Integer> pages = new ArrayList<>();
        List<Integer> secLevels = new ArrayList<>();
        List<String> regionCodes = new ArrayList<>();
        List<String> bizDomains = new ArrayList<>();
        List<Long> permGroupIds = new ArrayList<>();
        List<Long> aclVersions = new ArrayList<>();
        List<String> ownerUids = new ArrayList<>();
        List<String> effectiveFroms = new ArrayList<>();
        List<String> effectiveTos = new ArrayList<>();
        List<Long> createTimes = new ArrayList<>();
        List<String> tagsList = new ArrayList<>();
        List<String> chunkTypeList = new ArrayList<>();
        List<String> parentRefs = new ArrayList<>();
        List<String> keywordsList = new ArrayList<>();
        List<String> summaryList = new ArrayList<>();

        for (EmbedTaskMessage m : messages) {
            ids.add(System.currentTimeMillis() * 1000 + chunkSeqs.size());
            docIds.add(m.getDocId());
            tenantIds.add(m.getTenantId());
            versions.add(m.getVersion());
            chunkSeqs.add(m.getChunkSeq());
            vectors.add(m.getVector() != null && m.getVector().getEmbedding() != null ? m.getVector().getEmbedding() : new ArrayList<>());
            texts.add(m.getText() != null ? m.getText() : "");
            titles.add(m.getTitle() != null ? m.getTitle() : "");
            sectionPaths.add(m.getSectionPath() != null ? m.getSectionPath() : "");
            pages.add(m.getPage() != null ? m.getPage() : 1);
            secLevels.add(m.getSecLevel() != null ? m.getSecLevel() : 1);
            regionCodes.add(m.getRegionCode() != null ? m.getRegionCode() : "CN-NATIONAL");
            bizDomains.add(m.getBizDomain() != null ? m.getBizDomain() : "COMPLIANCE");
            permGroupIds.add(m.getPermGroupId() != null ? m.getPermGroupId() : 1L);
            aclVersions.add(m.getAclVersion() != null ? m.getAclVersion() : 1L);
            ownerUids.add(m.getOwnerUid() != null ? m.getOwnerUid() : "");
            effectiveFroms.add(m.getEffectiveFrom() != null ? m.getEffectiveFrom() : "");
            effectiveTos.add(m.getEffectiveTo() != null ? m.getEffectiveTo() : "");
            createTimes.add(m.getCreateTime() != null ? m.getCreateTime() : System.currentTimeMillis());
            tagsList.add(m.getTags() != null ? m.getTags() : "");
            chunkTypeList.add(m.getChunkType() != null ? m.getChunkType() : "");
            keywordsList.add(m.getKeywords() != null ? m.getKeywords() : "");
            summaryList.add(m.getSummary() != null ? m.getSummary() : "");
            parentRefs.add(m.getParentRef() != null ? m.getParentRef() : "");
        }

        fields.add(new InsertParam.Field("id", ids));
        fields.add(new InsertParam.Field("doc_id", docIds));
        fields.add(new InsertParam.Field("tenant_id", tenantIds));
        fields.add(new InsertParam.Field("version", versions));
        fields.add(new InsertParam.Field("chunk_seq", chunkSeqs));
        fields.add(new InsertParam.Field("parent_ref", parentRefs));
        fields.add(new InsertParam.Field("vector", vectors));
        fields.add(new InsertParam.Field("text", texts));
        fields.add(new InsertParam.Field("title", titles));
        fields.add(new InsertParam.Field("section_path", sectionPaths));
        fields.add(new InsertParam.Field("page", pages));
        fields.add(new InsertParam.Field("sec_level", secLevels));
        fields.add(new InsertParam.Field("region_code", regionCodes));
        fields.add(new InsertParam.Field("biz_domain", bizDomains));
        fields.add(new InsertParam.Field("perm_group_id", permGroupIds));
        fields.add(new InsertParam.Field("acl_version", aclVersions));
        fields.add(new InsertParam.Field("owner_uid", ownerUids));
        fields.add(new InsertParam.Field("effective_from", effectiveFroms));
        fields.add(new InsertParam.Field("effective_to", effectiveTos));
        fields.add(new InsertParam.Field("create_time", createTimes));
        fields.add(new InsertParam.Field("tags", tagsList));
        fields.add(new InsertParam.Field("chunk_type", chunkTypeList));
        fields.add(new InsertParam.Field("keywords", keywordsList));
        fields.add(new InsertParam.Field("summary", summaryList));

        UpsertParam param = UpsertParam.newBuilder()
                .withCollectionName(collectionName)
                .withFields(fields)
                .build();

        R<MutationResult> response = milvusClient.upsert(param);
        if (response.getStatus() != 0) {
            throw new RuntimeException("Milvus upsert failed: " + response.getMessage());
        }

        MutationResult result = response.getData();
        log.info("Milvus upsert: {} rows inserted, {} indexes: {} - {}",
                messages.size(), result.getInsertCnt(),
                result.getSuccIndexList(), result.getErrIndexList());

        return result.getSuccIndexList().stream()
                .map(Long::valueOf)
                .collect(Collectors.toList());
    }
}
