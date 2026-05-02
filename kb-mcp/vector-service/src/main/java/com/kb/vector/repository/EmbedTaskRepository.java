package com.kb.vector.repository;

import com.kb.vector.entity.EmbedTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface EmbedTaskRepository extends JpaRepository<EmbedTask, Long> {

    Optional<EmbedTask> findByTenantIdAndDocIdAndVersionAndChunkSeq(
            String tenantId, String docId, Integer version, Integer chunkSeq);

    @Modifying
    @Query("UPDATE EmbedTask t SET t.status = :status, t.milvusPk = :milvusPk, " +
           "t.processedAt = :processedAt, t.updatedAt = :updatedAt " +
           "WHERE t.tenantId = :tenantId AND t.docId = :docId AND t.version = :version " +
           "AND t.chunkSeq = :chunkSeq AND t.textHash = :textHash")
    int markDone(@Param("tenantId") String tenantId,
                 @Param("docId") String docId,
                 @Param("version") Integer version,
                 @Param("chunkSeq") Integer chunkSeq,
                 @Param("textHash") String textHash,
                 @Param("milvusPk") Long milvusPk,
                 @Param("processedAt") LocalDateTime processedAt,
                 @Param("updatedAt") LocalDateTime updatedAt,
                 @Param("status") String status);

    @Modifying
    @Query("UPDATE EmbedTask t SET t.status = :status, t.errorCode = :errorCode, " +
           "t.errorMsg = :errorMsg, t.retryCount = t.retryCount + 1, t.updatedAt = :updatedAt " +
           "WHERE t.tenantId = :tenantId AND t.docId = :docId AND t.version = :version " +
           "AND t.chunkSeq = :chunkSeq AND t.textHash = :textHash")
    int markFailed(@Param("tenantId") String tenantId,
                   @Param("docId") String docId,
                   @Param("version") Integer version,
                   @Param("chunkSeq") Integer chunkSeq,
                   @Param("textHash") String textHash,
                   @Param("status") String status,
                   @Param("errorCode") String errorCode,
                   @Param("errorMsg") String errorMsg,
                   @Param("updatedAt") LocalDateTime updatedAt);

    long countByTenantIdAndDocIdAndVersionAndStatusNot(
            String tenantId, String docId, Integer version, String status);
}
