package com.kb.rag.service;

import com.kb.rag.dto.*;
import com.kb.rag.config.DevContextProperties;
import com.kb.rag.config.RerankProperties;
import com.kb.rag.entity.KnowledgeSpace;
import com.kb.rag.repository.KnowledgeDocRepository;
import com.kb.rag.repository.KnowledgeSpaceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
    private final KnowledgeSpaceRepository knowledgeSpaceRepository;
    private final KnowledgeDocRepository knowledgeDocRepository;
    private final ParentLookupService parentLookupService;
    private final PipelineTraceService pipelineTraceService;
    private final DevContextProperties devContext;
    private final RerankResultSelector rerankResultSelector;
    private final RerankProperties rerankProperties;

    @Override
    public ChatResponse chat(ChatRequest request) {
        String traceId = "tr-" + UUID.randomUUID();
        String tenantId = request.getTenantId();
        String query = request.getQuery();
        PipelineTraceService.TraceContext trace = pipelineTraceService.start(
                traceId, tenantId, devContext.getUserId(), request.getSessionId(), query,
                request.getSpaceId(), request.getLang(), false);

        log.info("RAG chat traceId={} tenantId={} query={}", traceId, tenantId, query);

        try {
            // Step 1: Check cache
            List<Long> permGroupIds = getPermGroupIds();
            String cacheKey = cacheService.buildCacheKey(tenantId, query, permGroupIds);
            ChatResponse cached = trace.stage("cache_lookup", () -> cacheService.get(cacheKey));
            if (cached != null) {
                log.info("Cache hit: {}", cacheKey);
                cached.setTraceId(traceId);
                trace.setCacheHit(true);
                trace.setResult("CACHE_HIT");
                trace.setSessionId(cached.getSessionId());
                return cached;
            }

            // Step 2~9: Build pipeline context (query rewrite → retrieve → rerank → prompt)
            PipelineContext ctx = buildPipelineContext(request, traceId, trace);

            // Step 8: Refusal check
            if (ctx.refusal.refused()) {
                trace.setResult("REFUSED");
                trace.setRefusalReason(ctx.refusal.reason());
                return ChatResponse.builder()
                        .answer(ctx.refusal.message())
                        .citations(List.of())
                        .traceId(traceId)
                        .reason(ctx.refusal.reason())
                        .sessionId(ctx.sessionId)
                        .build();
            }

            // Step 10: Generate answer via llm-gateway
            String answer = trace.stage("llm_generate",
                    () -> llmGatewayClient.generate(ctx.llmRequest, traceId, tenantId));
            log.info("LLM generated answer, length={}", answer != null ? answer.length() : 0);

            // Step 11: Update session
            String sessionId = ctx.sessionId;
            if (sessionId == null) {
                sessionId = trace.stage("session_create", () -> sessionService.createSession(tenantId, devContext.getUserId()));
            }
            trace.setSessionId(sessionId);
            String finalSessionId = sessionId;
            Long messageId = trace.stage("session_save", () -> {
                SessionService.SessionData currentSession = sessionService.getSession(finalSessionId, tenantId);
                if (currentSession == null) {
                    currentSession = new SessionService.SessionData(finalSessionId, tenantId, devContext.getUserId(),
                            List.of(), System.currentTimeMillis(), System.currentTimeMillis());
                }
                return sessionService.appendTurnWithCitations(finalSessionId, currentSession, query, answer, ctx.citations, traceId);
            });

            // Step 11.5: Parse confidence from answer
            String confidence = extractConfidence(answer);
            String cleanAnswer = stripConfidenceTag(answer);

            // Step 12: Cache and return
            ChatResponse response = ChatResponse.builder()
                    .answer(cleanAnswer)
                    .citations(ctx.citations)
                    .traceId(traceId)
                    .sessionId(sessionId)
                    .messageId(messageId)
                    .confidence(confidence)
                    .build();

            trace.stage("cache_write", () -> cacheService.put(cacheKey, response));
            trace.setResult("SUCCESS");
            return response;
        } catch (RuntimeException e) {
            trace.markError(e);
            throw e;
        } finally {
            pipelineTraceService.finish(trace);
        }
    }

    @Override
    public void chatStream(ChatRequest request,
                           Consumer<String> onToken,
                           Consumer<ChatResponse> onComplete,
                           Consumer<Exception> onError) {
        String traceId = "tr-" + UUID.randomUUID();
        String tenantId = request.getTenantId();
        String query = request.getQuery();
        PipelineTraceService.TraceContext trace = pipelineTraceService.start(
                traceId, tenantId, devContext.getUserId(), request.getSessionId(), query,
                request.getSpaceId(), request.getLang(), true);

        log.info("RAG stream traceId={} tenantId={} query={}", traceId, tenantId, query);

        try {
            // Step 2~9: Build pipeline context
            PipelineContext ctx = buildPipelineContext(request, traceId, trace);

            // Ensure session exists early so frontend gets sessionId in done event
            String sessionId = ctx.sessionId;
            if (sessionId == null) {
                sessionId = trace.stage("session_create", () -> sessionService.createSession(tenantId, devContext.getUserId()));
            }
            trace.setSessionId(sessionId);

            // Step 8: Refusal check — stream refusal message directly
            if (ctx.refusal.refused()) {
                String msg = ctx.refusal.message();
                trace.markFirstToken();
                onToken.accept(msg);
                trace.setResult("REFUSED");
                trace.setRefusalReason(ctx.refusal.reason());
                onComplete.accept(ChatResponse.builder()
                        .answer(msg)
                        .citations(List.of())
                        .traceId(traceId)
                        .reason(ctx.refusal.reason())
                        .sessionId(sessionId)
                        .build());
                return;
            }

            // Step 10: Stream generation via llm-gateway
            StringBuilder fullAnswer = new StringBuilder();
            trace.stage("llm_generate_stream", () -> {
                try {
                    llmGatewayClient.generateStream(ctx.llmRequest, traceId, tenantId, token -> {
                        trace.markFirstToken();
                        fullAnswer.append(token);
                        onToken.accept(token);
                    });
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            log.info("LLM stream completed, answerLength={}", fullAnswer.length());

            // Step 11: Update session
            String finalSessionId = sessionId;
            Long messageId = trace.stage("session_save", () -> {
                SessionService.SessionData currentSession = sessionService.getSession(finalSessionId, tenantId);
                if (currentSession == null) {
                    currentSession = new SessionService.SessionData(finalSessionId, tenantId, devContext.getUserId(),
                            List.of(), System.currentTimeMillis(), System.currentTimeMillis());
                }
                return sessionService.appendTurnWithCitations(finalSessionId, currentSession,
                        query, fullAnswer.toString(), ctx.citations, traceId);
            });

            // Step 11.5: Parse confidence from full answer
            String rawAnswer = fullAnswer.toString();
            String confidence = extractConfidence(rawAnswer);
            String cleanAnswer = stripConfidenceTag(rawAnswer);

            // Step 12: Complete with metadata
            trace.setResult("SUCCESS");
            onComplete.accept(ChatResponse.builder()
                    .answer(cleanAnswer)
                    .citations(ctx.citations)
                    .traceId(traceId)
                    .sessionId(sessionId)
                    .messageId(messageId)
                    .confidence(confidence)
                    .build());

        } catch (Exception e) {
            trace.markError(e);
            log.error("Stream pipeline failed: {}", e.getMessage(), e);
            onError.accept(e);
        } finally {
            pipelineTraceService.finish(trace);
        }
    }

    /**
     * Shared pipeline preparation: query rewriting → embedding → retrieval → rerank → ACL → prompt.
     */
    private PipelineContext buildPipelineContext(ChatRequest request, String traceId,
                                                 PipelineTraceService.TraceContext trace) {
        String tenantId = request.getTenantId();
        String query = request.getQuery();

        // Step 2: Session context
        SessionContext sessionContext = trace.stage("session_context", () -> {
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
            return new SessionContext(session, previousQuery, previousAnswer);
        });

        // Step 3: Query rewriting
        String rewrittenQuery = trace.stage("query_rewrite", () -> {
            String rewritten = queryRewritingService.rewrite(query);
            rewritten = queryRewritingService.resolveContext(
                    rewritten, sessionContext.previousQuery(), sessionContext.previousAnswer());
            return keywordFallbackService.enhanceQuery(rewritten);
        });
        trace.setRewrittenQuery(rewrittenQuery);
        log.info("Query rewritten: {} -> {}", query, rewrittenQuery);

        // Step 4: Query vectorization
        String finalRewrittenQuery = rewrittenQuery;
        List<Float> queryVector = trace.stage("embedding", () -> embeddingClient.embed(finalRewrittenQuery));
        log.info("Query vectorized, dim={}", queryVector.size());

        // Step 5: Milvus vector search (tenant_id filter only, ACL done in post-filter below)
        int searchTopK = Math.max(request.getTopK(), 50);
        List<MilvusSearchResult> milvusResults = trace.stage("milvus_search", Map.of("topK", searchTopK),
                () -> milvusSearchService.search(queryVector, tenantId, devContext.getSecLevel(), getPermGroupIds(), searchTopK));
        log.info("Milvus returned {} results", milvusResults.size());

        // Step 5.5: ACL post-filter
        List<MilvusSearchResult> aclFiltered = trace.stage("acl_post_filter",
                () -> milvusSearchService.filterByAcl(milvusResults, devContext.getSecLevel(), getPermGroupIds()));
        log.info("ACL post-filter: {} -> {} results", milvusResults.size(), aclFiltered.size());

        // Step 5.6: Space scope filter
        if (request.getSpaceId() != null && !request.getSpaceId().isEmpty()) {
            List<MilvusSearchResult> source = aclFiltered;
            List<MilvusSearchResult> spaceFiltered = trace.stage("space_filter", Map.of("spaceId", request.getSpaceId()), () -> {
                Set<String> scopedDocIds = resolveScopeDocIds(tenantId, request.getSpaceId());
                return source.stream()
                        .filter(r -> scopedDocIds.contains(r.getDocId()))
                        .collect(Collectors.toList());
            });
            log.info("Space filter (spaceId={}): {} -> {} results",
                    request.getSpaceId(), aclFiltered.size(), spaceFiltered.size());
            aclFiltered = spaceFiltered;
        }

        boolean milvusHadResults = !aclFiltered.isEmpty();

        // Step 6: Rerank -> Top5 (with graceful fallback)
        List<String> chunkTexts = aclFiltered.stream()
                .map(MilvusSearchResult::getText)
                .collect(Collectors.toList());
        List<MilvusSearchResult> rerankSource = aclFiltered;
        List<MilvusSearchResult> reranked = trace.stage("rerank", () -> {
            try {
                List<RerankResponse.Result> rerankResults = rerankClient.rerank(finalRewrittenQuery, chunkTexts);
                log.info("Rerank returned {} results", rerankResults.size());
                return rerankResultSelector.select(rerankSource, rerankResults);
            } catch (Exception e) {
                log.warn("Rerank unavailable, falling back to vector similarity scores: {}", e.getMessage());
                rerankSource.sort((a, b) -> Double.compare(b.getVectorScore(), a.getVectorScore()));
                List<MilvusSearchResult> fallback = rerankSource.subList(0, Math.min(5, rerankSource.size()));
                double minScore = rerankProperties.getMinScore();
                for (MilvusSearchResult r : fallback) {
                    if (r.getVectorScore() < minScore) {
                        r.setVectorScore(minScore);
                    }
                }
                return fallback;
            }
        });

        // Step 7: ACL secondary verification
        List<MilvusSearchResult> verifySource = reranked.isEmpty() ? aclFiltered : reranked;
        List<CitationDto> citations = trace.stage("acl_verify",
                () -> aclVerificationService.verify(verifySource, tenantId, devContext.getUserId(), devContext.getUserGroups()));
        log.info("ACL verified: {} citations (from {} results)", citations.size(),
                reranked.isEmpty() ? aclFiltered.size() : reranked.size());

        // Step 7.5: Parent-Children 回捞 - 填充 Parent 完整文本
        List<CitationDto> parentLookupSource = citations;
        citations = trace.stage("parent_lookup", () -> parentLookupService.lookupAndEnrich(parentLookupSource, tenantId));

        citations.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        trace.setCounts(milvusResults.size(), aclFiltered.size(), reranked.size(), citations.size());

        // Step 8: Refusal check
        List<CitationDto> finalCitations = citations;
        RefusalService.RefusalResult refusal = trace.stage("refusal_check",
                () -> refusalService.check(finalCitations, milvusHadResults));

        // Step 9: Prompt construction
        List<SessionService.Turn> sessionHistory = sessionContext.session() != null
                ? sessionContext.session().turns()
                : null;
        List<CitationDto> promptCitations = citations;
        PromptConstructionService.BuildResult promptBuildResult = trace.stage("prompt_build",
                () -> promptConstructionService.buildPromptWithBudget(finalRewrittenQuery, promptCitations, sessionHistory));
        LlmGatewayRequest llmRequest = promptBuildResult.request();
        List<CitationDto> budgetedCitations = promptBuildResult.citations();
        trace.setCounts(milvusResults.size(), aclFiltered.size(), reranked.size(), budgetedCitations.size());
        trace.setHitDocs(budgetedCitations);
        trace.setPromptBudget(promptBuildResult.stats());

        return new PipelineContext(
                traceId, tenantId, query, rewrittenQuery, queryVector,
                milvusResults, aclFiltered, reranked, budgetedCitations, refusal,
                milvusHadResults, llmRequest, request.getSessionId(), sessionContext.session()
        );
    }

    private record SessionContext(
            SessionService.SessionData session,
            String previousQuery,
            String previousAnswer
    ) {}

    private record PipelineContext(
            String traceId,
            String tenantId,
            String query,
            String rewrittenQuery,
            List<Float> queryVector,
            List<MilvusSearchResult> milvusResults,
            List<MilvusSearchResult> aclFiltered,
            List<MilvusSearchResult> reranked,
            List<CitationDto> citations,
            RefusalService.RefusalResult refusal,
            boolean milvusHadResults,
            LlmGatewayRequest llmRequest,
            String sessionId,
            SessionService.SessionData session
    ) {}

    private Set<String> resolveScopeDocIds(String tenantId, String spaceId) {
        KnowledgeSpace space = knowledgeSpaceRepository.findById(spaceId).orElse(null);
        if (space == null) return Collections.emptySet();

        List<String> subTreeSpaceIds = knowledgeSpaceRepository
                .findSubtreeIdsByTenantIdAndNodePath(tenantId, space.getNodePath());
        if (subTreeSpaceIds.isEmpty()) {
            subTreeSpaceIds = List.of(spaceId);
        }

        List<String> docIds = knowledgeDocRepository
                .findDocIdsByTenantIdAndSpaceIdIn(tenantId, subTreeSpaceIds);
        return new HashSet<>(docIds);
    }

    private List<Long> getPermGroupIds() {
        return devContext.getPermGroupIds();
    }

    private static final Pattern CONFIDENCE_PATTERN =
            Pattern.compile("\\[CONFIDENCE:\\s*(HIGH|MEDIUM|LOW)\\s*\\]", Pattern.CASE_INSENSITIVE);

    String extractConfidence(String answer) {
        if (answer == null) return null;
        Matcher m = CONFIDENCE_PATTERN.matcher(answer);
        return m.find() ? m.group(1).toUpperCase() : null;
    }

    String stripConfidenceTag(String answer) {
        if (answer == null) return null;
        return CONFIDENCE_PATTERN.matcher(answer).replaceAll("").replaceAll("\\n\\s*\\n\\s*$", "").stripTrailing();
    }
}
