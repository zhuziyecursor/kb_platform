package com.kb.rag.repository;

import com.kb.rag.entity.EvalRun;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EvalRunRepository extends JpaRepository<EvalRun, Long> {

    Optional<EvalRun> findByRunId(String runId);

    List<EvalRun> findByDatasetIdOrderByCreatedAtDesc(String datasetId);

    Page<EvalRun> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);
}
