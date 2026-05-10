package com.kb.rag.repository;

import com.kb.rag.entity.RagMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RagMessageRepository extends JpaRepository<RagMessage, Long> {

    List<RagMessage> findBySessionIdOrderByCreatedAtAsc(String sessionId);

    @Modifying
    @Query("DELETE FROM RagMessage m WHERE m.sessionId = :sessionId")
    int deleteBySessionId(String sessionId);
}
