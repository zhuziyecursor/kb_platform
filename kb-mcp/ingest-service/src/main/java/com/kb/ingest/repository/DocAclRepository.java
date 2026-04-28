package com.kb.ingest.repository;

import com.kb.ingest.entity.DocAcl;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocAclRepository extends JpaRepository<DocAcl, Long> {

    List<DocAcl> findByTenantIdAndDocId(String tenantId, String docId);

    void deleteByTenantIdAndDocId(String tenantId, String docId);
}