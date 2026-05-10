package com.kb.vector.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class EmbedTaskMessage {

    @JsonProperty("traceId")
    private String traceId;

    @JsonProperty("tenantId")
    private String tenantId;

    @JsonProperty("docId")
    private String docId;

    @JsonProperty("version")
    private Integer version;

    @JsonProperty("chunkSeq")
    private Integer chunkSeq;

    @JsonProperty("text")
    private String text;

    @JsonProperty("textHash")
    private String textHash;

    @JsonProperty("title")
    private String title;

    @JsonProperty("sectionPath")
    private String sectionPath;

    @JsonProperty("page")
    private Integer page;

    @JsonProperty("secLevel")
    private Integer secLevel;

    @JsonProperty("regionCode")
    private String regionCode;

    @JsonProperty("bizDomain")
    private String bizDomain;

    @JsonProperty("permGroupId")
    private Long permGroupId;

    @JsonProperty("aclVersion")
    private Long aclVersion;

    @JsonProperty("ownerUid")
    private String ownerUid;

    @JsonProperty("deptId")
    private String deptId;

    @JsonProperty("effectiveFrom")
    private String effectiveFrom;

    @JsonProperty("effectiveTo")
    private String effectiveTo;

    @JsonProperty("createTime")
    private Long createTime;

    @JsonProperty("tags")
    private String tags;

    @JsonProperty("chunkType")
    private String chunkType;

    @JsonProperty("keywords")
    private String keywords;

    @JsonProperty("summary")
    private String summary;

    @JsonProperty("parentRef")
    private String parentRef;

    @JsonProperty("vector")
    private VectorData vector;

    @Data
    public static class VectorData {
        private Integer index;
        private List<Float> embedding;
    }
}
