package com.kb.rag.repository;

import com.kb.rag.entity.RagPipelineTrace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RagPipelineTraceRepository extends JpaRepository<RagPipelineTrace, Long> {

    Optional<RagPipelineTrace> findByTraceId(String traceId);
}
