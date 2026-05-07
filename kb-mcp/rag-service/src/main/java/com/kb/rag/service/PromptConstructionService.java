package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.LlmGatewayRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class PromptConstructionService {

    @Value("${app.llm.temperature}")
    private double temperature;

    @Value("${app.llm.max-tokens}")
    private int maxTokens;

    @Value("${app.llm.model}")
    private String model;

    private static final String SYSTEM_PROMPT = """
            你是企业知识库智能助手。请严格根据以下参考资料回答问题。

            规则：
            1. 如果参考资料中有相关信息，请基于资料内容作答，并在回答中使用 [1]、[2] 等标注引用来源。
            2. 如果参考资料中不包含相关信息，请明确回复"知识库中暂时没有找到相关资料"。
            3. 不要编造参考资料中没有的内容。
            4. 回答要求准确、简洁、专业。
            """;

    public LlmGatewayRequest buildPrompt(String query, List<CitationDto> citations,
                                          List<SessionService.Turn> sessionHistory) {
        StringBuilder userContent = new StringBuilder();
        userContent.append("问题：").append(query).append("\n\n");
        userContent.append("参考资料：\n");
        for (int i = 0; i < citations.size(); i++) {
            CitationDto c = citations.get(i);
            userContent.append("[").append(i + 1).append("] ");
            userContent.append("来源：").append(c.getTitle())
                    .append("（第").append(c.getPage()).append("页");
            if (c.getSectionPath() != null && !c.getSectionPath().isEmpty()) {
                userContent.append("，").append(c.getSectionPath());
            }
            userContent.append("）\n");
            userContent.append("内容：").append(c.getText()).append("\n\n");
        }

        List<LlmGatewayRequest.Message> messages = new ArrayList<>();
        messages.add(LlmGatewayRequest.Message.builder()
                .role("system")
                .content(SYSTEM_PROMPT)
                .build());

        if (sessionHistory != null) {
            for (SessionService.Turn turn : sessionHistory) {
                messages.add(LlmGatewayRequest.Message.builder()
                        .role("user")
                        .content(turn.query())
                        .build());
                messages.add(LlmGatewayRequest.Message.builder()
                        .role("assistant")
                        .content(turn.answer())
                        .build());
            }
        }

        messages.add(LlmGatewayRequest.Message.builder()
                .role("user")
                .content(userContent.toString())
                .build());

        return LlmGatewayRequest.builder()
                .model(model)
                .messages(messages)
                .temperature(temperature)
                .maxTokens(maxTokens)
                .build();
    }
}
