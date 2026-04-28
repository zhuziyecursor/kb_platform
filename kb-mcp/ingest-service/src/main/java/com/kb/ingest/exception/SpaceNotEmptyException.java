package com.kb.ingest.exception;

public class SpaceNotEmptyException extends RuntimeException {

    private final String spaceId;

    public SpaceNotEmptyException(String spaceId) {
        super("知识空间非空，无法删除: " + spaceId);
        this.spaceId = spaceId;
    }

    public String getSpaceId() {
        return spaceId;
    }
}