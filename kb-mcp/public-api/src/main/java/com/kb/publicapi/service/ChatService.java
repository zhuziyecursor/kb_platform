package com.kb.publicapi.service;

import com.kb.publicapi.dto.ChatRequest;
import com.kb.publicapi.dto.ChatResponse;

public interface ChatService {

    ChatResponse chat(ChatRequest request);
}
