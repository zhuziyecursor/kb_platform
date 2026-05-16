package com.kb.rag.service;

import com.kb.rag.entity.BadcaseArchive;
import com.kb.rag.repository.BadcaseArchiveRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.StringWriter;
import java.time.Instant;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class BadcaseService {

    private final BadcaseArchiveRepository badcaseRepository;

    @Transactional
    public BadcaseArchive updateStatus(Long id, String newStatus) {
        BadcaseArchive badcase = badcaseRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Badcase not found: " + id));

        String current = badcase.getStatus();
        if (!isValidTransition(current, newStatus)) {
            throw new IllegalArgumentException(
                    "Invalid status transition: " + current + " -> " + newStatus);
        }

        badcase.setStatus(newStatus);
        BadcaseArchive saved = badcaseRepository.save(badcase);
        log.info("Badcase {} status updated: {} -> {}", id, current, newStatus);
        return saved;
    }

    public String exportCsv(String tenantId, String status, String feedbackType,
                            String reportReason, Instant from, Instant to) {
        List<BadcaseArchive> items = badcaseRepository.findBadcases(
                tenantId, status, feedbackType, reportReason, from, to,
                PageRequest.of(0, 1000, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();

        StringWriter sw = new StringWriter();
        sw.write("id,trace_id,query_text,answer,feedback_type,report_reason,status,created_at\n");
        for (BadcaseArchive b : items) {
            sw.write(String.format("%d,%s,\"%s\",\"%s\",%s,%s,%s,%s\n",
                    b.getId(),
                    b.getTraceId(),
                    escapeCsv(b.getQueryText()),
                    escapeCsv(b.getAnswer()),
                    b.getFeedbackType(),
                    b.getReportReason() != null ? b.getReportReason() : "",
                    b.getStatus(),
                    b.getCreatedAt()));
        }
        return sw.toString();
    }

    private boolean isValidTransition(String current, String target) {
        return switch (current) {
            case "OPEN" -> "REVIEWED".equals(target);
            case "REVIEWED" -> "RESOLVED".equals(target) || "DISMISSED".equals(target);
            default -> false;
        };
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        return value.replace("\"", "\"\"");
    }
}
