package com.kb.rag.repository;

import com.kb.rag.entity.EvalQaPair;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EvalQaPairRepository extends JpaRepository<EvalQaPair, Long> {

    Page<EvalQaPair> findByDatasetId(String datasetId, Pageable pageable);

    @Query("""
        SELECT e FROM EvalQaPair e
        WHERE e.datasetId = :datasetId
          AND (:qaType IS NULL OR e.qaType = :qaType)
          AND (:difficulty IS NULL OR e.difficulty = :difficulty)
        ORDER BY e.createdAt ASC
    """)
    Page<EvalQaPair> findByDatasetIdWithFilters(
            @Param("datasetId") String datasetId,
            @Param("qaType") String qaType,
            @Param("difficulty") String difficulty,
            Pageable pageable);

    long countByDatasetId(String datasetId);

    void deleteByDatasetId(String datasetId);
}
