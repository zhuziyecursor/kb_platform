package com.kb.rag.service.retrieval;

import com.kb.rag.service.retrieval.channel.ChannelHit;
import com.kb.rag.service.retrieval.channel.RetrievalChannel;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.concurrent.Executors;

import static com.kb.rag.service.retrieval.RetrievalPlan.ChannelId.*;
import static org.assertj.core.api.Assertions.assertThat;

class ChannelExecutorTest {

    @Test
    void allChannelsRunAndSucceed() {
        ChannelExecutor exec = new ChannelExecutor(
                List.of(channelOf(DENSE, 1), channelOf(SPARSE, 2)),
                Executors.newFixedThreadPool(2),
                Optional.empty());

        ChannelExecutionResult result = exec.execute(
                ctx(Set.of(DENSE, SPARSE)),
                Map.of(DENSE, 10, SPARSE, 10));

        assertThat(result.successfulChannels()).contains("DENSE", "SPARSE");
        assertThat(result.failedChannels()).isEmpty();
        assertThat(result.channelResults().get(DENSE)).hasSize(1);
        assertThat(result.channelResults().get(SPARSE)).hasSize(2);
    }

    @Test
    void channelException_recordedInFailedChannels() {
        ChannelExecutor exec = new ChannelExecutor(
                List.of(channelOf(DENSE, 1), throwingChannel(SPARSE)),
                Executors.newFixedThreadPool(2),
                Optional.empty());

        ChannelExecutionResult result = exec.execute(
                ctx(Set.of(DENSE, SPARSE)),
                Map.of(DENSE, 10, SPARSE, 10));

        assertThat(result.successfulChannels()).contains("DENSE").doesNotContain("SPARSE");
        assertThat(result.failedChannels()).containsKey("SPARSE");
    }

    @Test
    void inapplicableChannel_skipped() {
        ChannelExecutor exec = new ChannelExecutor(
                List.of(channelOf(STRUCTURED, 1)),
                Executors.newSingleThreadExecutor(),
                Optional.empty());

        // Plan does not enable STRUCTURED
        ChannelExecutionResult result = exec.execute(
                ctx(Set.of(DENSE)),
                Map.of(STRUCTURED, 5));

        assertThat(result.channelResults()).doesNotContainKey(STRUCTURED);
    }

    private static RetrievalContext ctx(Set<RetrievalPlan.ChannelId> channels) {
        return RetrievalContext.withoutVector(
                new RetrievalPlan("tr", "tenant-a", "q", "q",
                        List.of("q"), List.of(), Set.of(),
                        List.of(), null,
                        RetrievalPlan.QueryType.OTHER,
                        RetrievalPlan.RouteDecision.FULL_RAG,
                        channels),
                3, List.of(1L));
    }

    private static RetrievalChannel channelOf(RetrievalPlan.ChannelId cid, int hitCount) {
        return new RetrievalChannel() {
            @Override public RetrievalPlan.ChannelId id() { return cid; }
            @Override public boolean isApplicable(RetrievalPlan plan) {
                return plan.enabledChannels().contains(cid);
            }
            @Override public List<ChannelHit> retrieve(RetrievalPlan plan, int topK) {
                List<ChannelHit> hits = new ArrayList<>();
                for (int i = 1; i <= hitCount; i++) {
                    hits.add(new ChannelHit(cid, "d" + i, 1, 0, i, 0.9 - i * 0.1,
                            "txt", "ttl", 1, 1L, "", "CN-NATIONAL", Map.of()));
                }
                return hits;
            }
        };
    }

    private static RetrievalChannel throwingChannel(RetrievalPlan.ChannelId cid) {
        return new RetrievalChannel() {
            @Override public RetrievalPlan.ChannelId id() { return cid; }
            @Override public boolean isApplicable(RetrievalPlan plan) {
                return plan.enabledChannels().contains(cid);
            }
            @Override public List<ChannelHit> retrieve(RetrievalPlan plan, int topK) {
                throw new RuntimeException("simulated channel failure");
            }
        };
    }
}
