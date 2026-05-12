package com.kb.publicapi.dto;

public record ErrorResponse(String code, String message, String traceId) {

    public static ErrorResponse of(String code, String message, String traceId) {
        return new ErrorResponse(code, message, traceId);
    }
}
