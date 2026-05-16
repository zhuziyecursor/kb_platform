package com.kb.rag.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ChatRequest {

    @NotBlank
    private String tenantId;

    private String sessionId;

    private String biz;

    private String lang = "zh";

    @NotBlank
    private String query;

    private Integer topK = 20;

    private String spaceId;

    /**
     * Optional expert/agent system prompt. When present, it overrides the
     * default RAG answer style while keeping retrieval and citation context.
     */
    private String systemPrompt;

    /**
     * If true (default), the streaming endpoint emits {@code event: stage}
     * frames so the client can render a retrieval thinking chain. Set false
     * as an emergency kill switch — token/done/error frames are unaffected.
     */
    private Boolean showThinking = Boolean.TRUE;

    /**
     * Chat mode: {@code "rag"} (default) runs the full retrieval pipeline;
     * {@code "assistant"} skips retrieval and calls the LLM directly for
     * general Q&A without knowledge base citations.
     */
    private String mode = "rag";
}
