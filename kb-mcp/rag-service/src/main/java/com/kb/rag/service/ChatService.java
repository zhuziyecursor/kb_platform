package com.kb.rag.service;

import com.kb.rag.dto.ChatRequest;
import com.kb.rag.dto.ChatResponse;

import java.util.function.Consumer;

public interface ChatService {

    ChatResponse chat(ChatRequest request);

    /**
     * Streaming RAG chat.
     *
     * @param request   user query
     * @param onToken   called for each token chunk from LLM
     * @param onComplete called with final metadata when stream ends
     * @param onError   called if pipeline fails
     */
    void chatStream(ChatRequest request,
                    Consumer<String> onToken,
                    Consumer<ChatResponse> onComplete,
                    Consumer<Exception> onError);
}
