package com.kb.rag.repository;

import com.kb.rag.entity.EvalDataset;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EvalDatasetRepository extends JpaRepository<EvalDataset, Long> {

    Optional<EvalDataset> findByDatasetId(String datasetId);

    Page<EvalDataset> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    void deleteByDatasetId(String datasetId);
}
