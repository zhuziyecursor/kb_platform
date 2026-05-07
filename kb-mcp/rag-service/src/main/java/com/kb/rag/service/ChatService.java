package com.kb.rag.service;

import com.kb.rag.dto.ChatRequest;
import com.kb.rag.dto.ChatResponse;

public interface ChatService {

    ChatResponse chat(ChatRequest request);
}
