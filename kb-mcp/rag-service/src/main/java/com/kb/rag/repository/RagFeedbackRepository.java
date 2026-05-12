package com.kb.rag.repository;

import com.kb.rag.entity.RagFeedback;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RagFeedbackRepository extends JpaRepository<RagFeedback, Long> {

    Optional<RagFeedback> findByTraceId(String traceId);
}
