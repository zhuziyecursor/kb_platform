package com.kb.rag.service;

import com.kb.rag.config.PromptBudgetProperties;
import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.LlmGatewayRequest;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PromptConstructionServiceTest {

    @Test
    void usesSystemPromptOverrideWhenProvided() {
        PromptBudgetProperties properties = new PromptBudgetProperties();
        properties.setEnabled(false);
        PromptBudgetPlanner planner = new PromptBudgetPlanner(properties, new TokenEstimator());
        PromptConstructionService service = new PromptConstructionService(planner);
        ReflectionTestUtils.setField(service, "temperature", 0.2d);
        ReflectionTestUtils.setField(service, "maxTokens", 512);
        ReflectionTestUtils.setField(service, "model", "test-model");

        PromptConstructionService.BuildResult result = service.buildPromptWithBudget(
                "请分析合同风险",
                List.of(CitationDto.builder()
                        .docId("doc-1")
                        .title("合同管理办法")
                        .page(3)
                        .sectionPath("风险审查")
                        .score(0.9)
                        .text("合同签署前应完成风险审查。")
                        .build()),
                List.of(),
                "你是一位合同风控专家。"
        );

        LlmGatewayRequest request = result.request();

        assertThat(request.getModel()).isEqualTo("test-model");
        assertThat(request.getMessages()).isNotEmpty();
        assertThat(request.getMessages().get(0).getRole()).isEqualTo("system");
        assertThat(request.getMessages().get(0).getContent()).isEqualTo("你是一位合同风控专家。");
        assertThat(request.getMessages().get(request.getMessages().size() - 1).getContent())
                .contains("请分析合同风险")
                .contains("合同签署前应完成风险审查。");
    }
}
