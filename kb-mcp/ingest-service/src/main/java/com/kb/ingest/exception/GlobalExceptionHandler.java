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