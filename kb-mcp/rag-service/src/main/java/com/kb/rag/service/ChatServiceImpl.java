package com.kb.rag.service;

import com.kb.rag.dto.*;
import com.kb.rag.config.DevContextProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import com.kb.rag.config.RerankProperties;
import com.kb.rag.entity.KnowledgeSpace;
import com.kb.rag.repository.KnowledgeDocRepository;
import com.kb.rag.repository.KnowledgeSpaceRepository;
import com.kb.rag.service.retrieval.*;
import com.kb.rag.service.retrieval.attribution.ChannelAttribution;
import com.kb.rag.service.retrieval.channel.*;
import com.kb.rag.service.retrieval.fusion.HybridFusionService;
import com.kb.rag.service.retrieval.fusion.FusedHit;
import com.kb.rag.service.retrieval.diversity.MmrDiversitySelector;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
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
    private final Bm25SearchService bm25SearchService;
    private final RRFFusionService rrfFusionService;
    private final FaqService faqService;
    private final IntentRouter intentRouter;

    // Sprint 3: hybrid retrieval
    private final RuleQueryPlanner ruleQueryPlanner;
    private final QueryPlannerFacade queryPlannerFacade;
    private final ChannelExecutor channelExecutor;
    private final HybridFusionService hybridFusionService;
    private final MmrDiversitySelector mmrDiversitySelector;
    private final DenseChannel denseChannel;
    private final FaqChannel faqChannel;
    private final ChannelAttribution channelAttribution;

    private final Optional<MeterRegistry> meterRegistry;

    @Value("${app.llm.model:MiniMax-M2.7}")
    private String llmModel;

    @Value("${app.retrieval.dense-fail-close:true}")
    private boolean denseFailClose;

    @Value("${app.clause-fast-path.enabled:true}")
    private boolean clauseFastPathEnabled;

    @Value("${app.retrieval.rollout-percent:0}")
    private int rolloutPercent;

    @Value("${app.retrieval.plan.llm-enabled:true}")
    private boolean llmPlannerEnabled;

    @Override
    public ChatResponse chat(ChatRequest request) {
        String traceId = "tr-" + UUID.randomUUID();
        String tenantId = request.getTenantId();
        String query = request.getQuery();
        PipelineTraceService.TraceContext trace = pipelineTraceService.start(
                traceId, tenantId, devContext.getUserId(), request.getSessionId(), query,
                request.getSpaceId(), request.getLang(), false);

        log.info("RAG chat traceId={} tenantId={} query={}", traceId, tenantId, query);

        // === Assistant mode: skip retrieval, chat directly with LLM ===
        if ("assistant".equalsIgnoreCase(request.getMode())) {
            return chatAssistant(request, traceId, tenantId, query, trace);
        }

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

            // Step 2~9: Build pipeline context (no-op stage emitter for non-streaming path)
            PipelineContext ctx = buildPipelineContext(request, traceId, trace, NOOP_STAGE);

            // Handle FAQ / CHITCHAT shortcuts
            if (ctx.answer != null) {
                trace.setResult("SUCCESS");
                if (ctx.faqMatch != null) {
                    trace.setSessionId(ctx.sessionId);
                }
                return buildFinalResponse(ctx, traceId);
            }

            // Step 8: Refusal check (includes DENSE_UNAVAILABLE)
            if (ctx.refusal.refused()) {
                trace.setResult("REFUSED");
                trace.setRefusalReason(ctx.refusal.reason());
                return ChatResponse.builder()
                        .answer(ctx.refusal.message())
                        .citations(List.of())
                        .traceId(traceId)
                        .reason(ctx.refusal.reason())
                        .sessionId(ctx.sessionId)
                        .channelStats(ctx.channelStats)
                        .build();
            }

            // Step 10: Generate answer via llm-gateway
            String answer = trace.stage("llm_generate",
                    () -> llmGatewayClient.generate(ctx.llmRequest, traceId, tenantId));
            log.info("LLM generated answer, length={}", answer != null ? answer.length() : 0);

            // Step 11: Update session
            String sessionId = ctx.sessionId;
            if (sessionId == null) {
                sessionId = trace.stage("session_create",
                        () -> sessionService.createSession(tenantId, devContext.getUserId()));
            }
            trace.setSessionId(sessionId);
            String finalSessionId = sessionId;
            Long messageId = trace.stage("session_save", () -> {
                SessionService.SessionData currentSession = sessionService.getSession(finalSessionId, tenantId);
                if (currentSession == null) {
                    currentSession = new SessionService.SessionData(finalSessionId, tenantId, devContext.getUserId(),
                            List.of(), System.currentTimeMillis(), System.currentTimeMillis());
                }
                return sessionService.appendTurnWithCitations(finalSessionId, currentSession,
                        query, answer, ctx.citations, traceId);
            });

            // Step 11.5: Parse confidence
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
                    .intent(ctx.intent)
                    .searchMode(ctx.searchMode)
                    .channelStats(ctx.channelStats)
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
                           Consumer<Exception> onError,
                           Consumer<StageEvent> onStage) {
        String traceId = "tr-" + UUID.randomUUID();
        String tenantId = request.getTenantId();
        String query = request.getQuery();
        PipelineTraceService.TraceContext trace = pipelineTraceService.start(
                traceId, tenantId, devContext.getUserId(), request.getSessionId(), query,
                request.getSpaceId(), request.getLang(), true);

        log.info("RAG stream traceId={} tenantId={} query={}", traceId, tenantId, query);

        // Honor request-level kill switch for the retrieval thinking chain.
        boolean stageEnabled = !Boolean.FALSE.equals(request.getShowThinking()) && onStage != null;
        Consumer<StageEvent> stageSink = stageEnabled ? onStage : NOOP_STAGE;

        // === Assistant mode: skip retrieval, chat directly with LLM ===
        if ("assistant".equalsIgnoreCase(request.getMode())) {
            chatStreamAssistant(request, traceId, tenantId, query, trace, stageSink, onToken, onComplete, onError);
            return;
        }

        try {
            // Step 2~9: Build pipeline context — stage events flow through stageSink
            PipelineContext ctx = buildPipelineContext(request, traceId, trace, stageSink);

            // Ensure session exists early
            String sessionId = ctx.sessionId;
            if (sessionId == null) {
                sessionId = trace.stage("session_create",
                        () -> sessionService.createSession(tenantId, devContext.getUserId()));
                emitStage(stageSink, trace, "session_create", Map.of("sessionId", sessionId));
            }
            trace.setSessionId(sessionId);

            // Handle FAQ / CHITCHAT shortcuts
            if (ctx.answer != null) {
                String msg = ctx.answer;
                trace.markFirstToken();
                onToken.accept(msg);
                trace.setResult("SUCCESS");
                String finalSessionId = sessionId;
                onComplete.accept(buildFinalResponse(ctx, traceId));
                return;
            }

            // Step 8: Refusal check — stream refusal message
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
                        .channelStats(ctx.channelStats)
                        .build());
                return;
            }

            // Step 10: Stream generation
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
            emitStage(stageSink, trace, "llm_generate_stream", Map.of("tokens", fullAnswer.length()));

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
            emitStage(stageSink, trace, "session_save", Map.of("messageId", messageId));

            // Step 11.5: Parse confidence
            String rawAnswer = fullAnswer.toString();
            String confidence = extractConfidence(rawAnswer);
            String cleanAnswer = stripConfidenceTag(rawAnswer);

            // Step 12: Complete
            trace.setResult("SUCCESS");
            onComplete.accept(ChatResponse.builder()
                    .answer(cleanAnswer)
                    .citations(ctx.citations)
                    .traceId(traceId)
                    .sessionId(sessionId)
                    .messageId(messageId)
                    .confidence(confidence)
                    .intent(ctx.intent)
                    .searchMode(ctx.searchMode)
                    .channelStats(ctx.channelStats)
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
     * Assistant mode: direct LLM chat without retrieval. Builds a simple
     * message list from systemPrompt + session history + user query and
     * streams the response.
     */
    private void chatStreamAssistant(ChatRequest request, String traceId, String tenantId,
                                     String query, PipelineTraceService.TraceContext trace,
                                     Consumer<StageEvent> stageSink,
                                     Consumer<String> onToken,
                                     Consumer<ChatResponse> onComplete,
                                     Consumer<Exception> onError) {
        try {
            // Load session history
            SessionService.SessionData session = null;
            if (request.getSessionId() != null) {
                session = sessionService.getSession(request.getSessionId(), tenantId);
            }
            emitStage(stageSink, trace, "assistant_mode", Map.of(
                    "hasHistory", session != null && !session.turns().isEmpty()));

            // Build messages: system prompt + history + user query
            List<LlmGatewayRequest.Message> messages = new ArrayList<>();
            if (request.getSystemPrompt() != null && !request.getSystemPrompt().isBlank()) {
                messages.add(LlmGatewayRequest.Message.builder()
                        .role("system")
                        .content(request.getSystemPrompt())
                        .build());
            }
            if (session != null) {
                for (SessionService.Turn turn : session.turns()) {
                    messages.add(LlmGatewayRequest.Message.builder()
                            .role("user")
                            .content(turn.query())
                            .build());
                    if (turn.answer() != null && !turn.answer().isBlank()) {
                        messages.add(LlmGatewayRequest.Message.builder()
                                .role("assistant")
                                .content(turn.answer())
                                .build());
                    }
                }
            }
            messages.add(LlmGatewayRequest.Message.builder()
                    .role("user")
                    .content(query)
                    .build());

            LlmGatewayRequest llmRequest = LlmGatewayRequest.builder()
                    .model(llmModel)
                    .messages(messages)
                    .temperature(0.3)
                    .maxTokens(2048)
                    .build();

            // Stream generation
            StringBuilder fullAnswer = new StringBuilder();
            trace.stage("llm_generate_stream", () -> {
                try {
                    llmGatewayClient.generateStream(llmRequest, traceId, tenantId, token -> {
                        trace.markFirstToken();
                        fullAnswer.append(token);
                        onToken.accept(token);
                    });
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            log.info("Assistant stream completed, answerLength={}", fullAnswer.length());
            emitStage(stageSink, trace, "llm_generate_stream", Map.of("tokens", fullAnswer.length()));

            // Ensure session exists and save message
            String sessionId = request.getSessionId();
            if (sessionId == null) {
                sessionId = trace.stage("session_create",
                        () -> sessionService.createSession(tenantId, devContext.getUserId()));
            }
            trace.setSessionId(sessionId);
            String finalSessionId = sessionId;

            Long messageId = trace.stage("session_save", () -> {
                SessionService.SessionData currentSession = sessionService.getSession(finalSessionId, tenantId);
                if (currentSession == null) {
                    currentSession = new SessionService.SessionData(finalSessionId, tenantId,
                            devContext.getUserId(), List.of(),
                            System.currentTimeMillis(), System.currentTimeMillis());
                }
                return sessionService.appendTurnWithCitations(finalSessionId, currentSession,
                        query, fullAnswer.toString(), List.of(), traceId);
            });

            trace.setResult("SUCCESS");
            onComplete.accept(ChatResponse.builder()
                    .answer(fullAnswer.toString())
                    .citations(List.of())
                    .traceId(traceId)
                    .sessionId(sessionId)
                    .messageId(messageId)
                    .searchMode("ASSISTANT")
                    .build());

        } catch (Exception e) {
            trace.markError(e);
            log.error("Assistant stream failed: {}", e.getMessage(), e);
            onError.accept(e);
        } finally {
            pipelineTraceService.finish(trace);
        }
    }

    private static final Consumer<StageEvent> NOOP_STAGE = e -> { };

    /**
     * Assistant mode (blocking): direct LLM chat without retrieval.
     */
    private ChatResponse chatAssistant(ChatRequest request, String traceId, String tenantId,
                                       String query, PipelineTraceService.TraceContext trace) {
        try {
            SessionService.SessionData session = null;
            if (request.getSessionId() != null) {
                session = sessionService.getSession(request.getSessionId(), tenantId);
            }

            List<LlmGatewayRequest.Message> messages = new ArrayList<>();
            if (request.getSystemPrompt() != null && !request.getSystemPrompt().isBlank()) {
                messages.add(LlmGatewayRequest.Message.builder()
                        .role("system")
                        .content(request.getSystemPrompt())
                        .build());
            }
            if (session != null) {
                for (SessionService.Turn turn : session.turns()) {
                    messages.add(LlmGatewayRequest.Message.builder()
                            .role("user").content(turn.query()).build());
                    if (turn.answer() != null && !turn.answer().isBlank()) {
                        messages.add(LlmGatewayRequest.Message.builder()
                                .role("assistant").content(turn.answer()).build());
                    }
                }
            }
            messages.add(LlmGatewayRequest.Message.builder()
                    .role("user").content(query).build());

            LlmGatewayRequest llmRequest = LlmGatewayRequest.builder()
                    .model(llmModel)
                    .messages(messages)
                    .temperature(0.3)
                    .maxTokens(2048)
                    .build();

            String answer = trace.stage("llm_generate",
                    () -> llmGatewayClient.generate(llmRequest, traceId, tenantId));
            log.info("Assistant generated answer, length={}", answer != null ? answer.length() : 0);

            String sessionId = request.getSessionId();
            if (sessionId == null) {
                sessionId = trace.stage("session_create",
                        () -> sessionService.createSession(tenantId, devContext.getUserId()));
            }
            trace.setSessionId(sessionId);
            String finalSessionId = sessionId;

            Long messageId = trace.stage("session_save", () -> {
                SessionService.SessionData currentSession = sessionService.getSession(finalSessionId, tenantId);
                if (currentSession == null) {
                    currentSession = new SessionService.SessionData(finalSessionId, tenantId,
                            devContext.getUserId(), List.of(),
                            System.currentTimeMillis(), System.currentTimeMillis());
                }
                return sessionService.appendTurnWithCitations(finalSessionId, currentSession,
                        query, answer, List.of(), traceId);
            });

            trace.setResult("SUCCESS");
            return ChatResponse.builder()
                    .answer(answer)
                    .citations(List.of())
                    .traceId(traceId)
                    .sessionId(sessionId)
                    .messageId(messageId)
                    .searchMode("ASSISTANT")
                    .build();
        } catch (RuntimeException e) {
            trace.markError(e);
            throw e;
        } finally {
            pipelineTraceService.finish(trace);
        }
    }

    /**
     * Emit one StageEvent to the SSE sink. Duration is read from the trace's
     * last-recorded stage, so this must be called immediately after the
     * corresponding {@code trace.stage(...)} block (no intervening trace.stage
     * calls). Summary values must be small and free of chunk text.
     */
    private void emitStage(Consumer<StageEvent> onStage,
                           PipelineTraceService.TraceContext trace,
                           String stage,
                           Map<String, Object> summary) {
        if (onStage == null || onStage == NOOP_STAGE) return;
        try {
            onStage.accept(StageEvent.builder()
                    .stage(stage)
                    .status("SUCCESS")
                    .durationMs(trace.getLastStageDurationMs())
                    .elapsedMs(trace.elapsedMs())
                    .summary(summary)
                    .build());
        } catch (RuntimeException e) {
            // SSE sink failures must never break the pipeline.
            log.debug("emitStage failed for stage={}: {}", stage, e.getMessage());
        }
    }

    private PipelineContext buildPipelineContext(ChatRequest request, String traceId,
                                                 PipelineTraceService.TraceContext trace,
                                                 Consumer<StageEvent> onStage) {
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

        emitStage(onStage, trace, "session_context", Map.of(
                "hasHistory", sessionContext.session() != null && !sessionContext.session().turns().isEmpty()));

        // Sprint 3 hybrid routing: hash-based rollout
        List<SessionService.Turn> history = sessionContext.session() != null
                ? sessionContext.session().turns()
                : List.of();

        boolean hybrid = isHybridBucket(tenantId, request.getSessionId());
        String variant = hybrid ? "HYBRID" : "LEGACY";
        meterRegistry.ifPresent(registry ->
                Counter.builder("rag.rollout.variant")
                        .description("Rollout variant per request")
                        .tag("variant", variant)
                        .register(registry)
                        .increment());

        if (hybrid) {
            return buildHybridPipelineContext(request, traceId, trace, history, sessionContext, onStage);
        }

        // === LEGACY PATH (Sprint 1-2) ===
        QueryRewritingService.RewriteResult rewriteResult = trace.stage("query_rewrite",
                () -> queryRewritingService.rewrite(query, history));
        String rewrittenQuery = rewriteResult.rewrittenQuery();
        String detectedIntent = rewriteResult.intent();
        trace.setRewrittenQuery(rewrittenQuery);
        log.info("Query rewritten: {} -> {} intent={}", query, rewrittenQuery, detectedIntent);
        emitStage(onStage, trace, "query_rewrite", Map.of(
                "rewrittenQuery", rewrittenQuery == null ? "" : rewrittenQuery,
                "intent", detectedIntent == null ? "" : detectedIntent));

        // Step 3.5: Intent routing
        IntentRouter.RouteDecision route = trace.stage("intent_route",
                () -> intentRouter.route(detectedIntent));
        String searchMode = route.name();
        emitStage(onStage, trace, "intent_route", Map.of(
                "searchMode", searchMode,
                "isChitchat", route == IntentRouter.RouteDecision.CHITCHAT));
        if (route == IntentRouter.RouteDecision.CHITCHAT) {
            return new PipelineContext(traceId, tenantId, query, rewrittenQuery, List.of(),
                    List.of(), List.of(), List.of(), List.of(),
                    null, false, null, request.getSessionId(), sessionContext.session(),
                    "抱歉，我是企业知识库助手，只能回答知识库内的问题。请尝试询问与公司制度、流程或审计相关的问题。",
                    null, detectedIntent, searchMode, Map.of(),
                    ChannelExecutionResult.allSuccess());
        }

        // Step 4+6: Parallelize embedding and BM25 (both independent)
        long parallelStart = System.currentTimeMillis();
        CompletableFuture<List<Float>> embeddingFuture = CompletableFuture.supplyAsync(
                () -> embeddingClient.embed(rewrittenQuery));
        CompletableFuture<List<Bm25SearchResult>> bm25Future = CompletableFuture.supplyAsync(
                () -> bm25SearchService.searchSafe(query, tenantId));

        // Wait for both to complete
        List<Float> queryVector;
        List<Bm25SearchResult> bm25Results;
        try {
            queryVector = embeddingFuture.get();
            bm25Results = bm25Future.get();
        } catch (Exception e) {
            throw new RuntimeException("Parallel retrieval failed", e);
        }
        long parallelDuration = System.currentTimeMillis() - parallelStart;
        log.info("Parallel embedding+BM25 completed in {}ms (embedding={} dims, bm25={} hits)",
                parallelDuration, queryVector.size(), bm25Results.size());

        // Emit combined stage event
        emitStage(onStage, trace, "embedding", Map.of(
                "dimensions", queryVector.size(),
                "parallelWith", "bm25",
                "durationMs", parallelDuration));

        // Step 5: FAQ shortcut check
        FaqService.FaqMatch faqMatch = trace.stage("faq_check",
                () -> faqService.match(query, queryVector, tenantId,
                        devContext.getSecLevel(), getPermGroupIds()));
        emitStage(onStage, trace, "faq_check", Map.of("matched", faqMatch != null));
        if (faqMatch != null) {
            log.info("FAQ shortcut: query='{}' matched='{}'", query, faqMatch.question());
            return new PipelineContext(traceId, tenantId, query, rewrittenQuery, queryVector,
                    List.of(), List.of(), List.of(), List.of(),
                    null, false, null, request.getSessionId(), sessionContext.session(),
                    faqMatch.answer(), faqMatch, detectedIntent, searchMode,
                    Map.of("FAQ", 1), ChannelExecutionResult.allSuccess());
        }

        // Emit BM25 stage event (after parallel execution completes)
        emitStage(onStage, trace, "bm25_search", Map.of("hits", bm25Results.size()));

        // Step 7: Dense Milvus search with fail-close
        int searchTopK = Math.max(request.getTopK(), 50);
        final var milvusHolder = new Object() {
            List<MilvusSearchResult> value = List.of();
            boolean failed = false;
            String errorMessage = null;
        };
        trace.stage("milvus_search", Map.<String, Object>of("topK", searchTopK), () -> {
            try {
                milvusHolder.value = milvusSearchService.search(queryVector, tenantId,
                        devContext.getSecLevel(), getPermGroupIds(), searchTopK);
                return milvusHolder.value;
            } catch (Exception e) {
                milvusHolder.failed = true;
                milvusHolder.errorMessage = e.getMessage();
                log.warn("Milvus dense search failed: {}", e.getMessage());
                return List.<MilvusSearchResult>of();
            }
        });
        List<MilvusSearchResult> milvusResults = milvusHolder.value;
        boolean denseFailed = milvusHolder.failed;
        log.info("Milvus returned {} results (denseFailed={})", milvusResults.size(), denseFailed);
        emitStage(onStage, trace, "milvus_search", Map.of(
                "topK", searchTopK,
                "recallCount", milvusResults.size(),
                "denseFailed", denseFailed));

        // Build channel execution result
        ChannelExecutionResult channelResult;
        if (denseFailed) {
            channelResult = ChannelExecutionResult.withFailure(
                    ChannelExecutionResult.DENSE, milvusHolder.errorMessage);
        } else {
            channelResult = ChannelExecutionResult.allSuccess();
        }

        // Step 7.5: DENSE fail-close check
        if (denseFailed && denseFailClose) {
            log.warn("DENSE fail-close: refusing request, Milvus unavailable");
            RefusalService.RefusalResult denseRefusal = refusalService.denseUnavailable();
            return new PipelineContext(traceId, tenantId, query, rewrittenQuery, queryVector,
                    milvusResults, List.of(), List.of(), List.of(),
                    denseRefusal, false, null, request.getSessionId(), sessionContext.session(),
                    null, null, detectedIntent, searchMode, Map.of(),
                    channelResult);
        }

        // Step 7.6: ACL post-filter on Milvus results
        List<MilvusSearchResult> aclFiltered = trace.stage("acl_post_filter",
                () -> milvusSearchService.filterByAcl(milvusResults, devContext.getSecLevel(), getPermGroupIds()));
        log.info("ACL post-filter: {} -> {} results", milvusResults.size(), aclFiltered.size());
        emitStage(onStage, trace, "acl_post_filter", Map.of(
                "kept", aclFiltered.size(),
                "dropped", milvusResults.size() - aclFiltered.size()));

        // Step 7.7: ACL filter BM25 results too
        List<Bm25SearchResult> aclBm25 = filterBm25ByAcl(bm25Results);
        log.info("BM25 ACL filter: {} -> {} results", bm25Results.size(), aclBm25.size());

        // Record ACL drops
        int denseDropped = milvusResults.size() - aclFiltered.size();
        int sparseDropped = bm25Results.size() - aclBm25.size();
        meterRegistry.ifPresent(registry -> {
            if (denseDropped > 0) {
                Counter.builder("rag.acl.filter_dropped")
                        .description("Results dropped by ACL post-filter")
                        .tag("channel", "DENSE")
                        .register(registry)
                        .increment(denseDropped);
            }
            if (sparseDropped > 0) {
                Counter.builder("rag.acl.filter_dropped")
                        .description("Results dropped by ACL post-filter")
                        .tag("channel", "SPARSE")
                        .register(registry)
                        .increment(sparseDropped);
            }
        });

        // Step 7.8: RRF fusion (Dense + BM25)
        List<MilvusSearchResult> fusedSource = aclFiltered;
        List<Bm25SearchResult> fusedBm25 = aclBm25;
        List<RRFFusionService.FusedResult> fused = trace.stage("rrf_fusion",
                () -> rrfFusionService.fuse(aclFiltered, fusedBm25));
        log.info("RRF fusion: {} dense + {} bm25 -> {} fused",
                aclFiltered.size(), aclBm25.size(), fused.size());
        emitStage(onStage, trace, "rrf_fusion", Map.of(
                "denseCount", aclFiltered.size(),
                "bm25Count", aclBm25.size(),
                "fusedCount", fused.size()));

        // Step 7.9: Clause fast path
        boolean clauseMatched = false;
        if (clauseFastPathEnabled) {
            KeywordFallbackService.ClauseMatch clauseMatch = trace.stage("clause_fast_path",
                    () -> keywordFallbackService.matchClause(query, tenantId));
            clauseMatched = clauseMatch.matched();
            emitStage(onStage, trace, "clause_fast_path", Map.of(
                    "matched", clauseMatched,
                    "hits", clauseMatched ? clauseMatch.hits().size() : 0));
            if (clauseMatched) {
                log.info("Clause fast path matched: {} docs", clauseMatch.hits().size());
                trace.setClauseMatched(true);
                // Prepend clause-matched docs as synthetic MilvusSearchResults at rank-1
                List<MilvusSearchResult> clauseResults = new ArrayList<>();
                for (KeywordFallbackService.ClauseHit hit : clauseMatch.hits()) {
                    MilvusSearchResult mr = MilvusSearchResult.builder()
                            .docId(hit.docId())
                            .version(hit.version())
                            .chunkSeq(0)
                            .text("")
                            .title(hit.title())
                            .sectionPath(hit.sectionPath())
                            .secLevel(hit.secLevel())
                            .permGroupId(hit.permGroupId())
                            .effectiveTo(hit.effectiveTo())
                            .regionCode(hit.regionCode())
                            .vectorScore(1.0)
                            .build();
                    clauseResults.add(mr);
                }
                // Merge: clause results first, then fused results without duplicates
                Set<String> clauseDocKeys = clauseMatch.hits().stream()
                        .map(h -> HybridFusionService.buildKey(h.docId(), h.version(), 0))
                        .collect(Collectors.toSet());
                List<MilvusSearchResult> merged = new ArrayList<>(clauseResults);
                for (RRFFusionService.FusedResult fr : fused) {
                    if (!clauseDocKeys.contains(HybridFusionService.buildKey(fr.docId(), fr.version(), 0))) {
                        merged.add(fusedToMilvus(fr));
                    }
                }
                fusedSource = merged;
            } else {
                fusedSource = fused.stream()
                        .map(this::fusedToMilvus)
                        .collect(Collectors.toList());
            }
        } else {
            fusedSource = fused.stream()
                    .map(this::fusedToMilvus)
                    .collect(Collectors.toList());
        }
        trace.setClauseMatched(clauseMatched);

        // Step 7.10: Space scope filter
        if (request.getSpaceId() != null && !request.getSpaceId().isEmpty()) {
            List<MilvusSearchResult> source = fusedSource;
            List<MilvusSearchResult> spaceFiltered = trace.stage("space_filter",
                    Map.of("spaceId", request.getSpaceId()), () -> {
                        Set<String> scopedDocIds = resolveScopeDocIds(tenantId, request.getSpaceId());
                        return source.stream()
                                .filter(r -> scopedDocIds.contains(r.getDocId()))
                                .collect(Collectors.toList());
                    });
            log.info("Space filter (spaceId={}): {} -> {} results",
                    request.getSpaceId(), fusedSource.size(), spaceFiltered.size());
            emitStage(onStage, trace, "space_filter", Map.of(
                    "spaceId", request.getSpaceId(),
                    "kept", spaceFiltered.size(),
                    "dropped", fusedSource.size() - spaceFiltered.size()));
            fusedSource = spaceFiltered;
        }

        boolean milvusHadResults = !fusedSource.isEmpty();

        // Step 8: Rerank -> Top5
        List<MilvusSearchResult> rerankSource = fusedSource;
        List<String> chunkTexts = rerankSource.stream()
                .map(r -> r.getText() != null && !r.getText().isEmpty() ? r.getText() : " ")
                .collect(Collectors.toList());
        List<MilvusSearchResult> reranked = trace.stage("rerank", () -> {
            try {
                List<RerankResponse.Result> rerankResults = rerankClient.rerank(rewrittenQuery, chunkTexts);
                log.info("Rerank returned {} results", rerankResults.size());
                return rerankResultSelector.select(rerankSource, rerankResults);
            } catch (Exception e) {
                log.warn("Rerank unavailable, preserving fusion scores: {}", e.getMessage());
                trace.setRerankFallback(true);
                meterRegistry.ifPresent(registry ->
                        Counter.builder("rag.rerank.fallback")
                                .description("Rerank fallback count")
                                .register(registry)
                                .increment());
                rerankSource.sort((a, b) -> Double.compare(b.getVectorScore(), a.getVectorScore()));
                return new ArrayList<>(rerankSource.subList(0, Math.min(5, rerankSource.size())));
            }
        });
        emitStage(onStage, trace, "rerank", Map.of(
                "topN", reranked.size(),
                "fallback", trace.isRerankFallback()));

        // Step 9: ACL secondary verification
        List<MilvusSearchResult> verifySource = reranked.isEmpty() ? rerankSource : reranked;
        List<CitationDto> citations = trace.stage("acl_verify",
                () -> aclVerificationService.verify(verifySource, tenantId,
                        devContext.getUserId(), devContext.getUserGroups()));
        log.info("ACL verified: {} citations", citations.size());
        emitStage(onStage, trace, "acl_verify", Map.of("citationsCount", citations.size()));

        // Step 9.5: Annotate citations with source channels
        Map<String, Set<String>> channelMap = channelAttribution.buildChannelMap(aclFiltered, aclBm25, fused);
        channelAttribution.annotateCitations(citations, channelMap);

        // Step 9.6: Parent-Children enrichment
        List<CitationDto> parentLookupSource = citations;
        citations = trace.stage("parent_lookup",
                () -> parentLookupService.lookupAndEnrich(parentLookupSource, tenantId));
        emitStage(onStage, trace, "parent_lookup", Map.of("enrichedCount", citations.size()));

        citations.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        trace.setCounts(milvusResults.size(), aclFiltered.size(), reranked.size(), citations.size());

        // Step 10: Refusal check (rerank-fallback bumps threshold by +0.2)
        List<CitationDto> finalCitations = citations;
        boolean legacyRerankFallback = trace.isRerankFallback();
        RefusalService.RefusalResult refusal = trace.stage("refusal_check",
                () -> refusalService.check(finalCitations, milvusHadResults, legacyRerankFallback));
        if (refusal.refused()) {
            emitStage(onStage, trace, "refusal_check", Map.of("reason", refusal.reason()));
        } else {
            emitStage(onStage, trace, "refusal_check", Map.of("allowed", true));
        }

        // Step 11: Prompt construction
        List<CitationDto> promptCitations = citations;
        PromptConstructionService.BuildResult promptBuildResult = trace.stage("prompt_build",
                () -> promptConstructionService.buildPromptWithBudget(
                        rewrittenQuery, promptCitations, history, request.getSystemPrompt()));
        LlmGatewayRequest llmRequest = promptBuildResult.request();
        List<CitationDto> budgetedCitations = promptBuildResult.citations();
        trace.setCounts(milvusResults.size(), aclFiltered.size(), reranked.size(), budgetedCitations.size());
        trace.setHitDocs(budgetedCitations);
        trace.setPromptBudget(promptBuildResult.stats());

        PromptBudgetPlanner.PromptBudgetStats stats = promptBuildResult.stats();
        emitStage(onStage, trace, "prompt_build", Map.of(
                "estimatedTokens", stats != null ? stats.estimatedPromptTokens() : 0,
                "includedCitations", stats != null ? stats.includedCitations() : budgetedCitations.size(),
                "droppedCitations", stats != null ? stats.droppedCitations() : 0,
                "truncatedCitations", stats != null ? stats.truncatedCitations() : 0));

        // Build channel stats
        Map<String, Integer> channelStats = channelAttribution.buildChannelStats(fused, clauseMatched);
        trace.setChannelHits(channelStats.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> (Object) e.getValue())));

        return new PipelineContext(
                traceId, tenantId, query, rewrittenQuery, queryVector,
                milvusResults, aclFiltered, reranked, budgetedCitations, refusal,
                milvusHadResults, llmRequest, request.getSessionId(), sessionContext.session(),
                null, null, detectedIntent, searchMode, channelStats, channelResult
        );
    }

    private ChatResponse buildFinalResponse(PipelineContext ctx, String traceId) {
        return ChatResponse.builder()
                .answer(ctx.answer)
                .citations(ctx.citations != null ? ctx.citations : List.of())
                .traceId(traceId)
                .sessionId(ctx.sessionId)
                .intent(ctx.intent)
                .searchMode(ctx.searchMode)
                .channelStats(ctx.channelStats)
                .build();
    }

    // ---- Helper records ----

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
            SessionService.SessionData session,
            String answer,
            FaqService.FaqMatch faqMatch,
            String intent,
            String searchMode,
            Map<String, Integer> channelStats,
            ChannelExecutionResult channelExecutionResult
    ) {}

    // ---- Helper methods ----

    private MilvusSearchResult fusedToMilvus(RRFFusionService.FusedResult fr) {
        if (fr.denseResult() != null) {
            MilvusSearchResult r = fr.denseResult();
            r.setVectorScore(fr.rrfScore());
            return r;
        }
        // BM25-only: synthesize
        return MilvusSearchResult.builder()
                .docId(fr.docId())
                .version(fr.version())
                .chunkSeq(fr.chunkSeq())
                .text(fr.text())
                .title(fr.title())
                .vectorScore(fr.rrfScore())
                .secLevel(1)
                .permGroupId(0L)
                .regionCode("CN-NATIONAL")
                .build();
    }

    private List<Bm25SearchResult> filterBm25ByAcl(List<Bm25SearchResult> results) {
        int userSecLevel = devContext.getSecLevel();
        List<Long> permGroupIds = getPermGroupIds();
        return results.stream()
                .filter(r -> r.getSecLevel() <= userSecLevel)
                .filter(r -> permGroupIds.contains(r.getPermGroupId()))
                .collect(Collectors.toList());
    }

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

    // ---- Sprint 3: Hybrid Retrieval ----

    private boolean isHybridBucket(String tenantId, String sessionId) {
        if (rolloutPercent <= 0) return false;
        if (rolloutPercent >= 100) return true;
        int bucket = Math.floorMod(
                Objects.hash(tenantId, sessionId != null ? sessionId : ""), 100);
        return bucket < rolloutPercent;
    }

    private PipelineContext buildHybridPipelineContext(ChatRequest request, String traceId,
                                                         PipelineTraceService.TraceContext trace,
                                                         List<SessionService.Turn> history,
                                                         SessionContext sessionContext,
                                                         Consumer<StageEvent> onStage) {
        String tenantId = request.getTenantId();
        String query = request.getQuery();

        // Step 3: QueryPlanner (LLM with circuit breaker → rule fallback)
        RetrievalPlan plan = trace.stage("query_plan", () -> {
            if (llmPlannerEnabled) {
                return queryPlannerFacade.plan(tenantId, query, history);
            }
            return ruleQueryPlanner.plan(tenantId, query, history);
        });
        String rewrittenQuery = plan.rewrittenQuery();
        trace.setRewrittenQuery(rewrittenQuery);
        log.info("Hybrid plan: query='{}' -> rewritten='{}' queryType={} channels={}",
                query, rewrittenQuery, plan.queryType(), plan.enabledChannels());
        emitStage(onStage, trace, "query_plan", Map.of(
                "rewrittenQuery", rewrittenQuery == null ? "" : rewrittenQuery,
                "queryType", plan.queryType().name(),
                "searchMode", "HYBRID",
                "enabledChannels", plan.enabledChannels().stream().map(Enum::name).toList()));

        // Step 3.5: CHITCHAT early return
        if (plan.routeDecision() == RetrievalPlan.RouteDecision.CHITCHAT) {
            return new PipelineContext(traceId, tenantId, query, rewrittenQuery, List.of(),
                    List.of(), List.of(), List.of(), List.of(),
                    null, false, null, request.getSessionId(), sessionContext.session(),
                    "抱歉，我是企业知识库助手，只能回答知识库内的问题。请尝试询问与公司制度、流程或审计相关的问题。",
                    null, plan.queryType().name(), plan.routeDecision().name(),
                    Map.of(), ChannelExecutionResult.allSuccess());
        }

        // Step 4: Embedding
        List<Float> queryVector = trace.stage("embedding", () -> embeddingClient.embed(rewrittenQuery));
        log.info("Hybrid query vectorized, dim={}", queryVector.size());
        emitStage(onStage, trace, "embedding", Map.of("dimensions", queryVector.size()));

        int userSecLevel = devContext.getSecLevel();
        List<Long> permGroupIds = getPermGroupIds();

        // Step 5: FAQ shortcut check
        FaqService.FaqMatch faqMatch = trace.stage("faq_shortcut",
                () -> faqChannel.tryShortcut(query, queryVector, tenantId, userSecLevel, permGroupIds));
        emitStage(onStage, trace, "faq_shortcut", Map.of("matched", faqMatch != null));
        if (faqMatch != null) {
            log.info("Hybrid FAQ shortcut: query='{}' matched='{}'", query, faqMatch.question());
            return new PipelineContext(traceId, tenantId, query, rewrittenQuery, queryVector,
                    List.of(), List.of(), List.of(), List.of(),
                    null, false, null, request.getSessionId(), sessionContext.session(),
                    faqMatch.answer(), faqMatch, plan.queryType().name(), "HYBRID",
                    Map.of("FAQ", 1), ChannelExecutionResult.allSuccess());
        }

        // Step 6-8: Run ALL retrieval channels (DENSE + SPARSE + STRUCTURED + FAQ)
        // concurrently on the channel pool. RetrievalContext carries the per-request
        // query vector and ACL data into channels that need them.
        int searchTopK = Math.max(request.getTopK(), 50);
        RetrievalContext retrievalContext = new RetrievalContext(
                plan, queryVector, userSecLevel, permGroupIds);

        Map<RetrievalPlan.ChannelId, Integer> topKMap = new EnumMap<>(RetrievalPlan.ChannelId.class);
        topKMap.put(RetrievalPlan.ChannelId.DENSE, searchTopK);
        topKMap.put(RetrievalPlan.ChannelId.SPARSE, searchTopK);
        topKMap.put(RetrievalPlan.ChannelId.STRUCTURED, 5);
        topKMap.put(RetrievalPlan.ChannelId.FAQ, 3);
        topKMap.put(RetrievalPlan.ChannelId.METADATA, 20);

        ChannelExecutionResult executorResult = trace.stage("channel_executor",
                () -> channelExecutor.execute(retrievalContext, topKMap));
        Map<RetrievalPlan.ChannelId, List<ChannelHit>> allChannelHits =
                new EnumMap<>(executorResult.channelResults());
        ChannelExecutionResult channelResult = executorResult;
        boolean denseFailed = executorResult.isDenseFailed();
        List<ChannelHit> denseHits = allChannelHits.getOrDefault(RetrievalPlan.ChannelId.DENSE, List.of());
        trace.setChannelHits(channelAttribution.channelHitsSummary(allChannelHits));
        emitStage(onStage, trace, "channel_executor", Map.of(
                "channelHits", channelAttribution.channelHitsSummary(allChannelHits)));

        // Step 8.5: DENSE fail-close check
        if (denseFailed && denseFailClose) {
            log.warn("Hybrid DENSE fail-close: refusing request");
            RefusalService.RefusalResult denseRefusal = refusalService.denseUnavailable();
            return new PipelineContext(traceId, tenantId, query, rewrittenQuery, queryVector,
                    List.of(), List.of(), List.of(), List.of(),
                    denseRefusal, false, null, request.getSessionId(), sessionContext.session(),
                    null, null, plan.queryType().name(), "HYBRID",
                    Map.of(), channelResult);
        }

        // Step 9: Hybrid fusion (only over channels that actually succeeded)
        Set<RetrievalPlan.ChannelId> fusionChannels = channelResult.successfulChannelIds();

        List<FusedHit> fused = trace.stage("hybrid_fusion",
                () -> hybridFusionService.fuse(allChannelHits, plan, fusionChannels));
        log.info("Hybrid fusion: {} channels -> {} fused results", allChannelHits.size(), fused.size());
        emitStage(onStage, trace, "hybrid_fusion", Map.of(
                "channels", allChannelHits.size(),
                "fusedCount", fused.size()));

        // Convert FusedHit -> MilvusSearchResult for downstream pipeline compatibility
        List<MilvusSearchResult> fusedSource = fused.stream()
                .map(this::fusedHitToMilvus)
                .collect(Collectors.toList());

        // Step 10: ACL post-filter
        List<MilvusSearchResult> aclFiltered = trace.stage("acl_post_filter",
                () -> milvusSearchService.filterByAcl(fusedSource, userSecLevel, permGroupIds));
        log.info("Hybrid ACL filter: {} -> {} results", fusedSource.size(), aclFiltered.size());
        emitStage(onStage, trace, "acl_post_filter", Map.of(
                "kept", aclFiltered.size(),
                "dropped", fusedSource.size() - aclFiltered.size()));

        // Record ACL drops
        int hybridAclDropped = fusedSource.size() - aclFiltered.size();
        if (hybridAclDropped > 0) {
            meterRegistry.ifPresent(registry ->
                    Counter.builder("rag.acl.filter_dropped")
                            .description("Results dropped by ACL post-filter")
                            .tag("channel", "HYBRID")
                            .register(registry)
                            .increment(hybridAclDropped));
        }

        // Step 11: Space filter
        if (request.getSpaceId() != null && !request.getSpaceId().isEmpty()) {
            List<MilvusSearchResult> source = aclFiltered;
            List<MilvusSearchResult> spaceFiltered = trace.stage("space_filter",
                    Map.of("spaceId", request.getSpaceId()), () -> {
                        Set<String> scopedDocIds = resolveScopeDocIds(tenantId, request.getSpaceId());
                        return source.stream()
                                .filter(r -> scopedDocIds.contains(r.getDocId()))
                                .collect(Collectors.toList());
                    });
            aclFiltered = spaceFiltered;
            log.info("Hybrid space filter: {} -> {} results", source.size(), aclFiltered.size());
            emitStage(onStage, trace, "space_filter", Map.of(
                    "spaceId", request.getSpaceId(),
                    "kept", aclFiltered.size(),
                    "dropped", source.size() - aclFiltered.size()));
        }

        boolean milvusHadResults = !aclFiltered.isEmpty();

        // Step 12: Rerank → top-10 for MMR pool
        List<MilvusSearchResult> rerankSource = aclFiltered;
        List<String> chunkTexts = rerankSource.stream()
                .map(r -> r.getText() != null && !r.getText().isEmpty() ? r.getText() : " ")
                .collect(Collectors.toList());
        List<MilvusSearchResult> reranked = trace.stage("rerank", () -> {
            try {
                List<RerankResponse.Result> rerankResults = rerankClient.rerank(rewrittenQuery, chunkTexts);
                log.info("Hybrid rerank returned {} results", rerankResults.size());
                return rerankResultSelector.select(rerankSource, rerankResults);
            } catch (Exception e) {
                log.warn("Hybrid rerank unavailable: {}", e.getMessage());
                trace.setRerankFallback(true);
                meterRegistry.ifPresent(registry ->
                        Counter.builder("rag.rerank.fallback")
                                .description("Rerank fallback count")
                                .register(registry)
                                .increment());
                rerankSource.sort((a, b) -> Double.compare(b.getVectorScore(), a.getVectorScore()));
                return new ArrayList<>(rerankSource.subList(0, Math.min(10, rerankSource.size())));
            }
        });
        emitStage(onStage, trace, "rerank", Map.of(
                "topN", reranked.size(),
                "fallback", trace.isRerankFallback()));

        // Step 13: MMR diversity selection → top-5
        List<MilvusSearchResult> diverse = trace.stage("mmr_diversity",
                () -> mmrDiversitySelector.select(reranked));
        log.info("Hybrid MMR: {} reranked -> {} diverse", reranked.size(), diverse.size());
        emitStage(onStage, trace, "mmr_diversity", Map.of(
                "input", reranked.size(),
                "output", diverse.size()));

        // Step 14: ACL verify + annotations
        List<CitationDto> citations = trace.stage("acl_verify",
                () -> aclVerificationService.verify(diverse, tenantId,
                        devContext.getUserId(), devContext.getUserGroups()));
        emitStage(onStage, trace, "acl_verify", Map.of("citationsCount", citations.size()));

        // Annotate source channels
        channelAttribution.annotateCitationsFromFused(citations, fused);

        // Parent lookup
        List<CitationDto> preParentCitations = citations;
        citations = trace.stage("parent_lookup",
                () -> parentLookupService.lookupAndEnrich(preParentCitations, tenantId));
        citations.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        emitStage(onStage, trace, "parent_lookup", Map.of("enrichedCount", citations.size()));

        trace.setCounts(denseHits.size(), aclFiltered.size(), diverse.size(), citations.size());

        // Refusal check (rerank-fallback bumps threshold by +0.2)
        List<CitationDto> finalCitations = citations;
        boolean hybridRerankFallback = trace.isRerankFallback();
        RefusalService.RefusalResult refusal = trace.stage("refusal_check",
                () -> refusalService.check(finalCitations, milvusHadResults, hybridRerankFallback));
        if (refusal.refused()) {
            emitStage(onStage, trace, "refusal_check", Map.of("reason", refusal.reason()));
        } else {
            emitStage(onStage, trace, "refusal_check", Map.of("allowed", true));
        }

        // Prompt construction
        PromptConstructionService.BuildResult promptBuildResult = trace.stage("prompt_build",
                () -> promptConstructionService.buildPromptWithBudget(
                        rewrittenQuery, finalCitations, history, request.getSystemPrompt()));
        LlmGatewayRequest llmRequest = promptBuildResult.request();
        List<CitationDto> budgetedCitations = promptBuildResult.citations();
        trace.setHitDocs(budgetedCitations);
        trace.setPromptBudget(promptBuildResult.stats());

        PromptBudgetPlanner.PromptBudgetStats stats = promptBuildResult.stats();
        emitStage(onStage, trace, "prompt_build", Map.of(
                "estimatedTokens", stats != null ? stats.estimatedPromptTokens() : 0,
                "includedCitations", stats != null ? stats.includedCitations() : budgetedCitations.size(),
                "droppedCitations", stats != null ? stats.droppedCitations() : 0,
                "truncatedCitations", stats != null ? stats.truncatedCitations() : 0));

        // Channel stats
        Map<String, Integer> channelStats = channelAttribution.buildChannelStats(allChannelHits);

        return new PipelineContext(
                traceId, tenantId, query, rewrittenQuery, queryVector,
                fusedSource, aclFiltered, diverse, budgetedCitations, refusal,
                milvusHadResults, llmRequest, request.getSessionId(), sessionContext.session(),
                null, null, plan.queryType().name(), "HYBRID",
                channelStats, channelResult);
    }

    private MilvusSearchResult fusedHitToMilvus(FusedHit fh) {
        ChannelHit rep = fh.representative();
        return MilvusSearchResult.builder()
                .docId(fh.docId())
                .version(fh.version())
                .chunkSeq(fh.chunkSeq())
                .text(rep.text())
                .title(rep.title())
                .sectionPath(rep.meta() != null ? String.valueOf(rep.meta().getOrDefault("sectionPath", "")) : "")
                .secLevel(rep.secLevel())
                .permGroupId(rep.permGroupId())
                .effectiveTo(rep.effectiveTo())
                .regionCode(rep.regionCode())
                .parentRef(rep.meta() != null ? String.valueOf(rep.meta().getOrDefault("parentRef", "")) : "")
                .vectorScore(fh.fusionScore())
                .build();
    }

}
