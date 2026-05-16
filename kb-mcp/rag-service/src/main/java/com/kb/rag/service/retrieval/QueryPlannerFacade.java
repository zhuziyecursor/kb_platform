package com.kb.rag.service.retrieval;

import com.kb.rag.service.SessionService;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Circuit-breaker-protected facade over {@link LlmQueryPlanner}.
 *
 * <p>When the LLM planner fails (timeout, error, invalid output) at a rate exceeding
 * the configured threshold, the circuit opens and all calls are routed to
 * {@link RuleQueryPlanner} for 60 seconds before a half-open probe.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QueryPlannerFacade {

    private final LlmQueryPlanner llmQueryPlanner;
    private final RuleQueryPlanner ruleQueryPlanner;
    private final Optional<MeterRegistry> meterRegistry;

    @CircuitBreaker(name = "llmPlanner", fallbackMethod = "ruleFallback")
    public RetrievalPlan plan(String tenantId, String rawQuery,
                              List<SessionService.Turn> history) {
        RetrievalPlan plan = llmQueryPlanner.plan(tenantId, rawQuery, history);
        if (plan == null) {
            throw new RuntimeException("LLM planner returned null plan");
        }
        return plan;
    }

    @SuppressWarnings("unused")
    private RetrievalPlan ruleFallback(String tenantId, String rawQuery,
                                       List<SessionService.Turn> history, Throwable t) {
        log.warn("LLM planner circuit breaker fallback triggered: {}", t.getMessage());
        meterRegistry.ifPresent(registry -> {
            Counter.builder("rag.planner.fallback")
                    .description("LLM planner fallback to rule-based planner")
                    .tag("reason", t.getClass().getSimpleName())
                    .register(registry)
                    .increment();
        });
        return ruleQueryPlanner.plan(tenantId, rawQuery, history);
    }
}
