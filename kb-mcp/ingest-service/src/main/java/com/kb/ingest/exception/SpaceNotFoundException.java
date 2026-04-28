package com.kb.ingest.exception;

public class SpaceNotFoundException extends RuntimeException {

    private final String spaceId;

    public SpaceNotFoundException(String spaceId) {
        super("知识空间不存在: " + spaceId);
        this.spaceId = spaceId;
    }

    public String getSpaceId() {
        return spaceId;
    }
}