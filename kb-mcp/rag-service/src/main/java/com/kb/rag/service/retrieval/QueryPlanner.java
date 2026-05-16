package com.kb.rag.service.retrieval;

import com.kb.rag.service.SessionService;

import java.util.List;

public interface QueryPlanner {
    RetrievalPlan plan(String tenantId, String rawQuery, List<SessionService.Turn> history);
}
