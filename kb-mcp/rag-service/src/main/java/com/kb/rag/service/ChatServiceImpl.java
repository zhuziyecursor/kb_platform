package com.kb.rag.service;

import com.kb.rag.dto.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {

    private final QueryRewritingService queryRewritingService;
    private final KeywordFallbackService keywordFallbackService;
    private final EmbeddingServiceClient embeddingClient;
    private final MilvusSearchService milvusSearchService;
    private final RerankServiceClient rerankClient;
    private final AclVerificationService aclVerificationService;
    private final RefusalService refusalService;
    private final PromptConstructionService promptConstructionService;
    private final LlmGatewayClient llmGatewayClient;
    private final SessionService sessionService;
    private final CacheService cacheService;

    // MVP: hardcoded user context (PHASE2: from OBO token JWT claims)
    private static final String DEV_USER_ID = "current-user";
    private static final int DEV_SEC_LEVEL = 5;
    private static final List<Long> DEV_PERM_GROUP_IDS = List.of(1L);
    private static final List<String> DEV_USER_GROUPS = List.of();

    @Override
    public ChatResponse chat(ChatRequest request) {
        String traceId = "tr-" + UUID.randomUUID();
        String tenantId = request.getTenantId();
        String query = request.getQuery();

        log.info("RAG chat traceId={} tenantId={} query={}", traceId, tenantId, query);

        // Step 1: Check cache
        List<Long> permGroupIds = getPermGroupIds();
        String cacheKey = cacheService.buildCacheKey(tenantId, query, permGroupIds);
        ChatResponse cached = cacheService.get(cacheKey);
        if (cached != null) {
            log.info("Cache hit: {}", cacheKey);
            cached.setTraceId(traceId);
            return cached;
        }

        // Step 2: Session context
        SessionService.SessionData session = null;
        String previousQuery = null;
        String previousAnswer = null;
        if (request.getSessionId() != null) {
            session = sessionService.getSession(request.getSessionId(), tenantId);
            if (session != null && !session.turns().isEmpty()) {
                SessionService.Turn lastTurn = session.turns().get(session.turns().size() - 1);
                previousQuery = lastTurn.query();
                previousAnswer = lastTurn.answer();
            }
        }

        // Step 3: Query rewriting
        String rewrittenQuery = queryRewritingService.rewrite(query);
        rewrittenQuery = queryRewritingService.resolveContext(rewrittenQuery, previousQuery, previousAnswer);
        rewrittenQuery = keywordFallbackService.enhanceQuery(rewrittenQuery);
        log.info("Query rewritten: {} -> {}", query, rewrittenQuery);

        // Step 4: Query vectorization
        List<Float> queryVector = embeddingClient.embed(rewrittenQuery);
        log.info("Query vectorized, dim={}", queryVector.size());

        // Step 5: Milvus vector search (tenant_id filter only, ACL done in post-filter below)
        int searchTopK = Math.max(request.getTopK(), 50); // Request more since ACL filter happens client-side
        List<MilvusSearchResult> milvusResults = milvusSearchService.search(
                queryVector, tenantId, DEV_SEC_LEVEL, permGroupIds, searchTopK);
        log.info("Milvus returned {} results", milvusResults.size());

        // Step 5.5: ACL post-filter (compensates for Milvus 2.4.17 AND-expression bug)
        List<MilvusSearchResult> aclFiltered = milvusSearchService.filterByAcl(
                milvusResults, DEV_SEC_LEVEL, permGroupIds);
        log.info("ACL post-filter: {} -> {} results", milvusResults.size(), aclFiltered.size());

        // Step 6: Rerank -> Top5 (with graceful fallback if reranker is unavailable)
        List<String> chunkTexts = aclFiltered.stream()
                .map(MilvusSearchResult::getText)
                .collect(Collectors.toList());
        List<MilvusSearchResult> reranked;
        try {
            List<RerankResponse.Result> rerankResults = rerankClient.rerank(rewrittenQuery, chunkTexts);
            log.info("Rerank returned {} results", rerankResults.size());

            reranked = new ArrayList<>();
            for (RerankResponse.Result r : rerankResults) {
                if (r.getIndex() < aclFiltered.size()) {
                    MilvusSearchResult mr = aclFiltered.get(r.getIndex());
                    mr.setVectorScore(r.getScore());
                    reranked.add(mr);
                }
                if (reranked.size() >= 5) break;
            }
        } catch (Exception e) {
            log.warn("Rerank unavailable, falling back to vector similarity scores: {}", e.getMessage());
            aclFiltered.sort((a, b) -> Double.compare(b.getVectorScore(), a.getVectorScore()));
            reranked = aclFiltered.subList(0, Math.min(5, aclFiltered.size()));
        }

        // Step 7: ACL secondary verification (against doc_acl table in PostgreSQL)
        List<CitationDto> citations = aclVerificationService.verify(
                reranked.isEmpty() ? aclFiltered : reranked,
                tenantId, DEV_USER_ID, DEV_USER_GROUPS);
        log.info("ACL verified: {} citations (from {} results)", citations.size(),
                reranked.isEmpty() ? aclFiltered.size() : reranked.size());

        // Sort by score descending
        citations.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));

        // Step 8: Refusal check
        boolean milvusHadResults = !aclFiltered.isEmpty();
        RefusalService.RefusalResult refusal = refusalService.check(citations, milvusHadResults);
        if (refusal.refused()) {
            ChatResponse response = ChatResponse.builder()
                    .answer(refusal.message())
                    .citations(List.of())
                    .traceId(traceId)
                    .reason(refusal.reason())
                    .sessionId(request.getSessionId())
                    .build();
            return response;
        }

        // Step 9: Prompt construction
        List<SessionService.Turn> sessionHistory = session != null ? session.turns() : null;
        LlmGatewayRequest llmRequest = promptConstructionService.buildPrompt(
                rewrittenQuery, citations, sessionHistory);

        // Step 10: Generate answer via llm-gateway
        String answer = llmGatewayClient.generate(llmRequest, traceId, tenantId);
        log.info("LLM generated answer, length={}", answer != null ? answer.length() : 0);

        // Step 11: Update session
        String sessionId = request.getSessionId();
        if (sessionId == null) {
            sessionId = sessionService.createSession(tenantId, DEV_USER_ID);
        }
        SessionService.SessionData currentSession = sessionService.getSession(sessionId, tenantId);
        if (currentSession == null) {
            currentSession = new SessionService.SessionData(sessionId, tenantId, DEV_USER_ID,
                    List.of(), System.currentTimeMillis(), System.currentTimeMillis());
        }
        sessionService.appendTurn(sessionId, currentSession, query, answer);

        // Step 12: Cache and return
        ChatResponse response = ChatResponse.builder()
                .answer(answer)
                .citations(citations)
                .traceId(traceId)
                .sessionId(sessionId)
                .build();

        cacheService.put(cacheKey, response);
        return response;
    }

    private List<Long> getPermGroupIds() {
        return DEV_PERM_GROUP_IDS;
    }
}
