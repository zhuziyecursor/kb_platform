package com.kb.rag.repository;

import com.kb.rag.entity.DocAcl;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocAclRepository extends JpaRepository<DocAcl, Long> {

    @Query("SELECT a FROM DocAcl a WHERE a.tenantId = :tenantId AND a.docId IN :docIds")
    List<DocAcl> findByTenantIdAndDocIdIn(
            @Param("tenantId") String tenantId,
            @Param("docIds") List<String> docIds);
}
