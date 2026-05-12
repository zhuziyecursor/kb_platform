package com.kb.publicapi.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.util.UUID;

@Getter
public class PublicApiException extends RuntimeException {

    private final String code;
    private final String traceId;
    private final HttpStatus httpStatus;

    public PublicApiException(String code, String message, HttpStatus httpStatus) {
        super(message);
        this.code = code;
        this.traceId = "tr-" + UUID.randomUUID();
        this.httpStatus = httpStatus;
    }

    public static PublicApiException fileTooLarge(int maxBytes, long actualBytes) {
        return new PublicApiException("FILE_TOO_LARGE",
                "文件大小超过限制，最大 " + (maxBytes / 1024 / 1024) + "MB",
                HttpStatus.BAD_REQUEST);
    }

    public static PublicApiException upstreamUnavailable(String service) {
        return new PublicApiException("UPSTREAM_UNAVAILABLE",
                "上游服务 " + service + " 连接失败",
                HttpStatus.BAD_GATEWAY);
    }

    public static PublicApiException upstreamError(String detail) {
        return new PublicApiException("UPSTREAM_ERROR",
                "上游服务返回错误: " + detail,
                HttpStatus.BAD_GATEWAY);
    }

    public static PublicApiException docNotFound(String docId) {
        return new PublicApiException("DOC_NOT_FOUND",
                "文档不存在: " + docId,
                HttpStatus.NOT_FOUND);
    }
}
