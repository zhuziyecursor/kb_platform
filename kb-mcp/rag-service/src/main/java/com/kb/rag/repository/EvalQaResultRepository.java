package com.kb.rag.repository;

import com.kb.rag.entity.EvalQaResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EvalQaResultRepository extends JpaRepository<EvalQaResult, Long> {

    Page<EvalQaResult> findByRunId(String runId, Pageable pageable);

    long countByRunId(String runId);

    void deleteByRunId(String runId);
}
