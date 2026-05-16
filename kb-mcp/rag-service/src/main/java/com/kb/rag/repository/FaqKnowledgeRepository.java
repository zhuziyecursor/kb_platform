package com.kb.rag.repository;

import com.kb.rag.entity.FaqKnowledge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FaqKnowledgeRepository extends JpaRepository<FaqKnowledge, Long> {

    List<FaqKnowledge> findByTenantId(String tenantId);
}
