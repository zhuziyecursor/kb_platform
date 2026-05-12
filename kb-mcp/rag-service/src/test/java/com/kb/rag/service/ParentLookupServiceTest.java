package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ParentLookupServiceTest {

    @Test
    void enrichesCitationsWithParentTextByParentRef() {
        MilvusSearchService milvusSearchService = mock(MilvusSearchService.class);
        ParentLookupService service = new ParentLookupService(milvusSearchService);

        CitationDto citation = CitationDto.builder()
                .docId("doc-1")
                .chunkSeq(2)
                .text("child text")
                .parentRef("doc-1/1/0")
                .build();

        when(milvusSearchService.queryParentTexts(Set.of("doc-1/1/0"), "tenant-1"))
                .thenReturn(Map.of("doc-1/1/0", "parent full text"));

        List<CitationDto> enriched = service.lookupAndEnrich(List.of(citation), "tenant-1");

        assertThat(enriched).hasSize(1);
        assertThat(enriched.get(0).getParentText()).isEqualTo("parent full text");
        verify(milvusSearchService).queryParentTexts(Set.of("doc-1/1/0"), "tenant-1");
    }
}
