package com.kb.rag.service.retrieval;

import java.util.List;
import java.util.Set;

public record RetrievalPlan(
        String traceId,
        String tenantId,
        String rawQuery,
        String rewrittenQuery,
        List<String> subQueries,
        List<String> keywords,
        Set<String> clauseRefs,
        List<String> tagFilters,
        String chunkTypeFilter,
        QueryType queryType,
        RouteDecision routeDecision,
        Set<ChannelId> enabledChannels
) {
    public enum ChannelId { DENSE, SPARSE, STRUCTURED, METADATA, FAQ }

    public enum QueryType { POLICY_QA, DOC_SEARCH, DEFINITION, PROCEDURE, CHITCHAT, OTHER }

    public enum RouteDecision { FULL_RAG, DOC_SEARCH, CHITCHAT }
}
