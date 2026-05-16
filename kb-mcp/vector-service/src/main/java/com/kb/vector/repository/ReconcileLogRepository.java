package com.kb.vector.repository;

import com.kb.vector.entity.ReconcileLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ReconcileLogRepository extends JpaRepository<ReconcileLog, Long> {
}
