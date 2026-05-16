package com.kb.rag.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class IntentRouter {

    @Value("${app.intent.enabled:true}")
    private boolean intentEnabled;

    public RouteDecision route(String intent) {
        if (!intentEnabled || intent == null) {
            return RouteDecision.FULL_RAG;
        }

        return switch (intent.toUpperCase()) {
            case "CHITCHAT" -> RouteDecision.CHITCHAT;
            case "DOC_SEARCH" -> RouteDecision.DOC_SEARCH;
            default -> {
                log.debug("Intent '{}' routed to FULL_RAG", intent);
                yield RouteDecision.FULL_RAG;
            }
        };
    }

    public enum RouteDecision {
        FULL_RAG,
        DOC_SEARCH,
        CHITCHAT
    }
}
