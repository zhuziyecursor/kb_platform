package com.kb.rag.service.retrieval.diversity;

import com.kb.rag.dto.MilvusSearchResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class MmrDiversitySelectorTest {

    private MmrDiversitySelector selector;

    @BeforeEach
    void setUp() {
        selector = new MmrDiversitySelector();
        ReflectionTestUtils.setField(selector, "lambda", 0.7);
        ReflectionTestUtils.setField(selector, "parentCollapse", true);
        ReflectionTestUtils.setField(selector, "poolSize", 10);
        ReflectionTestUtils.setField(selector, "mmrOutputTopK", 5);
    }

    @Test
    void emptyInput_returnsEmpty() {
        assertThat(selector.select(List.of())).isEmpty();
    }

    @Test
    void parentCollapse_keepsHighestScorePerParent() {
        List<MilvusSearchResult> input = List.of(
                build("d1", 0, "parent-A", "alpha bravo charlie delta echo foxtrot golf", 0.9),
                build("d1", 1, "parent-A", "alpha bravo charlie delta echo foxtrot golf", 0.6),
                build("d2", 0, "parent-B", "lima mike november oscar papa quebec romeo", 0.5)
        );

        List<MilvusSearchResult> out = selector.select(input);

        // Parent-A collapsed → 1 result; Parent-B → 1 result; total 2
        assertThat(out).hasSize(2);
        assertThat(out)
                .filteredOn(r -> "parent-A".equals(r.getParentRef()))
                .hasSize(1)
                .first()
                .extracting(MilvusSearchResult::getVectorScore)
                .isEqualTo(0.9);
    }

    @Test
    void mmrSelects_diverseSetWhenScoresClustered() {
        // 6 chunks: 5 nearly identical text from same parent + 1 different
        List<MilvusSearchResult> input = IntStream.range(0, 5)
                .mapToObj(i -> build("d" + i, 0, "parent-shared",
                        "alpha bravo charlie delta echo foxtrot golf",
                        0.85 - i * 0.01))
                .collect(Collectors.toList());
        input.add(build("d99", 0, "parent-unique",
                "totally distinct words zebra yankee xray whiskey",
                0.40));

        List<MilvusSearchResult> out = selector.select(input);

        // After parent-collapse: 2 candidates → both selected
        assertThat(out).hasSize(2);
        assertThat(out).extracting(MilvusSearchResult::getDocId).contains("d99");
    }

    @Test
    void poolSize_cappedAtConfiguredLimit() {
        List<MilvusSearchResult> input = IntStream.range(0, 30)
                .mapToObj(i -> build("d" + i, 0, "p" + i,
                        "text segment " + i + " some words here filler filler",
                        0.99 - i * 0.01))
                .collect(Collectors.toList());

        List<MilvusSearchResult> out = selector.select(input);

        assertThat(out).hasSize(5); // mmrOutputTopK
    }

    private static MilvusSearchResult build(String docId, int chunkSeq, String parentRef, String text, double score) {
        MilvusSearchResult r = new MilvusSearchResult();
        r.setDocId(docId);
        r.setVersion(1);
        r.setChunkSeq(chunkSeq);
        r.setParentRef(parentRef);
        r.setText(text);
        r.setVectorScore(score);
        return r;
    }
}
