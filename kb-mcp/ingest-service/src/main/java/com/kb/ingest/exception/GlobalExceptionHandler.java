package com.kb.ingest.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(SpaceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleSpaceNotFound(SpaceNotFoundException ex) {
        String traceId = "tr-" + UUID.randomUUID().toString();
        log.warn("Space not found: {}, traceId: {}", ex.getSpaceId(), traceId);
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of(
                        "code", "SPACE_NOT_FOUND",
                        "message", ex.getMessage(),
                        "traceId", traceId
                ));
    }

    @ExceptionHandler(SpaceNotEmptyException.class)
    public ResponseEntity<Map<String, Object>> handleSpaceNotEmpty(SpaceNotEmptyException ex) {
        String traceId = "tr-" + UUID.randomUUID().toString();
        log.warn("Space not empty: {}, traceId: {}", ex.getSpaceId(), traceId);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of(
                        "code", "SPACE_NOT_EMPTY",
                        "message", ex.getMessage(),
                        "traceId", traceId
                ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String traceId = "tr-" + UUID.randomUUID().toString();
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .collect(Collectors.joining(", "));
        log.warn("Validation error: {}, traceId: {}", message, traceId);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of(
                        "code", "VALIDATION_ERROR",
                        "message", message,
                        "traceId", traceId
                ));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException ex) {
        String traceId = "tr-" + UUID.randomUUID().toString();
        String message = ex.getMessage();
        HttpStatus status = HttpStatus.BAD_REQUEST;

        if (message != null && message.startsWith("DUPLICATE_FILE:")) {
            String existingDocId = message.substring("DUPLICATE_FILE:".length());
            log.warn("Duplicate file: existingDocId={}, traceId={}", existingDocId, traceId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of(
                            "code", "DUPLICATE_FILE",
                            "message", "相同文件的文档已存在",
                            "traceId", traceId,
                            "existingDocId", existingDocId
                    ));
        }

        log.warn("Illegal state: {}, traceId: {}", message, traceId);
        return ResponseEntity.status(status)
                .body(Map.of(
                        "code", "ILLEGAL_STATE",
                        "message", message,
                        "traceId", traceId
                ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        String traceId = "tr-" + UUID.randomUUID().toString();
        log.warn("Illegal argument: {}, traceId: {}", ex.getMessage(), traceId);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of(
                        "code", "ILLEGAL_ARGUMENT",
                        "message", ex.getMessage(),
                        "traceId", traceId
                ));
    }

    @ExceptionHandler(UnsupportedOperationException.class)
    public ResponseEntity<Map<String, Object>> handleUnsupportedOperation(UnsupportedOperationException ex) {
        String traceId = "tr-" + UUID.randomUUID().toString();
        String message = ex.getMessage();
        if (message != null && message.startsWith("PHASE2_PLACEHOLDER:")) {
            log.info("PHASE2 feature requested: {}, traceId: {}", message, traceId);
            return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                    .body(Map.of(
                            "code", "PHASE2_FEATURE",
                            "message", message,
                            "traceId", traceId
                    ));
        }
        throw ex;
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneral(Exception ex) {
        String traceId = "tr-" + UUID.randomUUID().toString();
        log.error("Unexpected error, traceId: {}", traceId, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of(
                        "code", "INTERNAL_ERROR",
                        "message", "服务器内部错误",
                        "traceId", traceId
                ));
    }
}