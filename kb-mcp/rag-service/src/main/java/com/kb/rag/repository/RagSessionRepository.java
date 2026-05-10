package com.kb.rag.repository;

import com.kb.rag.entity.RagSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RagSessionRepository extends JpaRepository<RagSession, String> {

    List<RagSession> findByTenantIdAndUserIdOrderByUpdatedAtDesc(String tenantId, String userId);

    Optional<RagSession> findByIdAndTenantId(String id, String tenantId);

    @Modifying
    @Query("DELETE FROM RagSession s WHERE s.id = :id AND s.tenantId = :tenantId")
    int deleteByIdAndTenantId(String id, String tenantId);

    @Modifying
    @Query("UPDATE RagSession s SET s.title = :title, s.updatedAt = CURRENT_TIMESTAMP WHERE s.id = :id")
    int updateTitle(String id, String title);
}
