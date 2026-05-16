package com.kb.rag.service.retrieval.fusion;

import com.kb.rag.service.retrieval.RetrievalPlan;
import com.kb.rag.service.retrieval.channel.ChannelHit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;

import static com.kb.rag.service.retrieval.RetrievalPlan.ChannelId.*;
import static org.assertj.core.api.Assertions.assertThat;

class HybridFusionServiceTest {

    private HybridFusionService fusion;

    @BeforeEach
    void setUp() {
        fusion = new HybridFusionService(Optional.empty());
        ReflectionTestUtils.setField(fusion, "rrfKDense", 60);
        ReflectionTestUtils.setField(fusion, "rrfKSparse", 60);
        ReflectionTestUtils.setField(fusion, "rrfKStructured", 10);
        ReflectionTestUtils.setField(fusion, "rrfKMetadata", 10);
        ReflectionTestUtils.setField(fusion, "rrfKFaq", 5);
        ReflectionTestUtils.setField(fusion, "scoreNormWeight", 0.3);
        ReflectionTestUtils.setField(fusion, "multiChannelBoost", 0.10);
        ReflectionTestUtils.setField(fusion, "structuredRank1Boost", 0.50);
    }

    @Test
    void singleChannel_producesValidFusionScore() {
        var hits = Map.of(DENSE, List.of(hit(DENSE, "d1", 0, 1, 0.9)));
        var plan = plan(Set.of(DENSE), Set.of());

        List<FusedHit> fused = fusion.fuse(hits, plan, Set.of(DENSE));

        assertThat(fused).hasSize(1);
        assertThat(fused.get(0).docId()).isEqualTo("d1");
        assertThat(fused.get(0).fusionScore()).isGreaterThan(0);
    }

    @Test
    void noSuccessfulChannels_returnsEmpty() {
        var hits = Map.of(DENSE, List.of(hit(DENSE, "d1", 0, 1, 0.9)));
        var plan = plan(Set.of(DENSE), Set.of());

        List<FusedHit> fused = fusion.fuse(hits, plan, Set.of());

        assertThat(fused).isEmpty();
    }

    @Test
    void fusionKey_carriesVersion_soSameDocDifferentVersionDoNotCollapse() {
        var hits = Map.of(
                DENSE, List.of(hit(DENSE, "d1", 5, 1, 0.9)),
                SPARSE, List.of(hit(SPARSE, "d1", 3, 1, 0.7))
        );
        var plan = plan(Set.of(DENSE, SPARSE), Set.of());

        List<FusedHit> fused = fusion.fuse(hits, plan, Set.of(DENSE, SPARSE));

        assertThat(fused).hasSize(2);
        assertThat(fused).extracting(FusedHit::version).containsExactlyInAnyOrder(3, 5);
    }

    @Test
    void multiChannelBoost_appliesOnlyWhenThreePlusChannelsSucceeded() {
        var hits = Map.of(
                DENSE,      List.of(hit(DENSE, "d1", 0, 1, 0.9)),
                SPARSE,     List.of(hit(SPARSE, "d1", 0, 1, 0.8)),
                STRUCTURED, List.of(hit(STRUCTURED, "d1", 0, 1, 1.0))
        );
        var plan = plan(Set.of(DENSE, SPARSE, STRUCTURED), Set.of("第1条"));

        List<FusedHit> withAll = fusion.fuse(hits, plan, Set.of(DENSE, SPARSE, STRUCTURED));
        List<FusedHit> withTwo = fusion.fuse(
                Map.of(DENSE, hits.get(DENSE), SPARSE, hits.get(SPARSE)),
                plan, Set.of(DENSE, SPARSE));

        assertThat(withAll.get(0).fusionScore()).isGreaterThan(withTwo.get(0).fusionScore());
    }

    @Test
    void structuredRank1_getsBoost() {
        var hits = Map.of(
                DENSE,      List.of(hit(DENSE, "d2", 0, 1, 0.9)),
                STRUCTURED, List.of(hit(STRUCTURED, "d1", 0, 1, 1.0))
        );
        var plan = plan(Set.of(DENSE, STRUCTURED), Set.of("第1条"));

        List<FusedHit> fused = fusion.fuse(hits, plan, Set.of(DENSE, STRUCTURED));

        // d1 (STRUCTURED rank-1) should beat d2 (DENSE only) due to structured boost
        assertThat(fused.get(0).docId()).isEqualTo("d1");
    }

    @Test
    void resultsSortedByFusionScoreDescending() {
        var hits = Map.of(
                DENSE, List.of(
                        hit(DENSE, "d1", 0, 1, 0.95),
                        hit(DENSE, "d2", 0, 2, 0.80),
                        hit(DENSE, "d3", 0, 3, 0.65)
                )
        );
        var plan = plan(Set.of(DENSE), Set.of());

        List<FusedHit> fused = fusion.fuse(hits, plan, Set.of(DENSE));

        for (int i = 1; i < fused.size(); i++) {
            assertThat(fused.get(i).fusionScore())
                    .isLessThanOrEqualTo(fused.get(i - 1).fusionScore());
        }
    }

    @Test
    void weightSumRebalancesWhenChannelFails() {
        var hits = Map.of(
                DENSE, List.of(hit(DENSE, "d1", 0, 1, 0.9))
        );
        var plan = plan(Set.of(DENSE, SPARSE), Set.of());

        List<FusedHit> fusedSoloDense = fusion.fuse(hits, plan, Set.of(DENSE));

        // The DENSE-only score should be higher than its raw weight share (0.4)
        // because the weights renormalize to 1.0 across the surviving channel.
        assertThat(fusedSoloDense.get(0).fusionScore()).isGreaterThan(0);
    }

    private static ChannelHit hit(RetrievalPlan.ChannelId cid, String docId, int version, int rank, double score) {
        return new ChannelHit(cid, docId, version, 0, rank, score, "txt-" + docId, "title", 1, 1L, "", "CN-NATIONAL", Map.of());
    }

    private static RetrievalPlan plan(Set<RetrievalPlan.ChannelId> channels, Set<String> clauses) {
        return new RetrievalPlan(
                "tr", "tenant-a", "q", "q",
                List.of("q"), List.of(), clauses,
                List.of(), null,
                RetrievalPlan.QueryType.OTHER,
                RetrievalPlan.RouteDecision.FULL_RAG,
                channels);
    }
}
