package com.kb.ingest.repository;

import com.kb.ingest.entity.SpaceAcl;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SpaceAclRepository extends JpaRepository<SpaceAcl, Long> {

    List<SpaceAcl> findByTenantIdAndSpaceId(String tenantId, String spaceId);

    List<SpaceAcl> findByTenantIdAndAccessorTypeAndAccessorId(String tenantId, String accessorType, String accessorId);

    Optional<SpaceAcl> findByTenantIdAndSpaceIdAndAccessorTypeAndAccessorId(
            String tenantId, String spaceId, String accessorType, String accessorId);

    @Modifying
    @Query("DELETE FROM SpaceAcl s WHERE s.tenantId = :tenantId AND s.spaceId = :spaceId")
    void deleteByTenantIdAndSpaceId(@Param("tenantId") String tenantId, @Param("spaceId") String spaceId);
}
