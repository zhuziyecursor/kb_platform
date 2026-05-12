package com.kb.publicapi.exception;

import com.kb.publicapi.dto.ErrorResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;

import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(PublicApiException.class)
    public ResponseEntity<ErrorResponse> handlePublicApi(PublicApiException ex) {
        log.warn("PublicApiException: code={}, message={}, traceId={}",
                ex.getCode(), ex.getMessage(), ex.getTraceId());
        return ResponseEntity.status(ex.getHttpStatus())
                .body(ErrorResponse.of(ex.getCode(), ex.getMessage(), ex.getTraceId()));
    }

    @ExceptionHandler(HttpClientErrorException.class)
    public ResponseEntity<ErrorResponse> handleUpstream4xx(HttpClientErrorException ex) {
        String traceId = "tr-" + UUID.randomUUID();
        log.error("Upstream 4xx: status={}, body={}, traceId={}",
                ex.getStatusCode(), ex.getResponseBodyAsString(), traceId);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(ErrorResponse.of("UPSTREAM_ERROR",
                        "上游服务返回错误", traceId));
    }

    @ExceptionHandler(HttpServerErrorException.class)
    public ResponseEntity<ErrorResponse> handleUpstream5xx(HttpServerErrorException ex) {
        String traceId = "tr-" + UUID.randomUUID();
        log.error("Upstream 5xx: status={}, body={}, traceId={}",
                ex.getStatusCode(), ex.getResponseBodyAsString(), traceId);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(ErrorResponse.of("UPSTREAM_ERROR",
                        "上游服务暂时不可用", traceId));
    }

    @ExceptionHandler(ResourceAccessException.class)
    public ResponseEntity<ErrorResponse> handleConnectionError(ResourceAccessException ex) {
        String traceId = "tr-" + UUID.randomUUID();
        log.error("Upstream connection error: {}, traceId={}", ex.getMessage(), traceId);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(ErrorResponse.of("UPSTREAM_UNAVAILABLE",
                        "上游服务连接失败", traceId));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        String traceId = "tr-" + UUID.randomUUID();
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("VALIDATION_ERROR", message, traceId));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception ex) {
        String traceId = "tr-" + UUID.randomUUID();
        log.error("Unexpected error, traceId={}", traceId, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of("INTERNAL_ERROR", "服务器内部错误", traceId));
    }
}
