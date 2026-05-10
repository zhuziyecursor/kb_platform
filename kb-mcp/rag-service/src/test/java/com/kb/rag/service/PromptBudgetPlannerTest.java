package com.kb.rag.service;

import com.kb.rag.config.PromptBudgetProperties;
import com.kb.rag.dto.CitationDto;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PromptBudgetPlannerTest {

    private final TokenEstimator tokenEstimator = new TokenEstimator();

    @Test
    void limitsCitationsByConfiguredMaxCitations() {
        PromptBudgetProperties properties = new PromptBudgetProperties();
        properties.setMaxCitations(2);
        properties.setContextWindowTokens(4096);
        PromptBudgetPlanner planner = new PromptBudgetPlanner(properties, tokenEstimator);

        PromptBudgetPlanner.PromptPlan plan = planner.plan(
                "system",
                "报销流程是什么？",
                List.of(citation("doc-1", "第一条 报销流程"), citation("doc-2", "第二条 审批要求"),
                        citation("doc-3", "第三条 打款时间")),
                List.of(),
                512
        );

        assertThat(plan.citations()).hasSize(2);
        assertThat(plan.citations().get(0).citation().getDocId()).isEqualTo("doc-1");
        assertThat(plan.stats().droppedCitations()).isEqualTo(1);
    }

    @Test
    void keepsHighestScoreCitationsFirst() {
        PromptBudgetProperties properties = new PromptBudgetProperties();
        properties.setMaxCitations(2);
        PromptBudgetPlanner planner = new PromptBudgetPlanner(properties, tokenEstimator);

        PromptBudgetPlanner.PromptPlan plan = planner.plan(
                "system",
                "请说明转正流程",
                List.of(citation("low-score", "低分引用", 0.2),
                        citation("high-score", "高分引用", 0.95),
                        citation("mid-score", "中分引用", 0.6)),
                List.of(),
                512
        );

        assertThat(plan.citations()).extracting(c -> c.citation().getDocId())
                .containsExactly("high-score", "mid-score");
    }

    @Test
    void capsInputBudgetByConfiguredRatio() {
        PromptBudgetProperties properties = new PromptBudgetProperties();
        properties.setContextWindowTokens(4000);
        properties.setSafetyMarginTokens(0);
        properties.setInputBudgetRatio(0.75);
        PromptBudgetPlanner planner = new PromptBudgetPlanner(properties, tokenEstimator);

        PromptBudgetPlanner.PromptPlan plan = planner.plan(
                "system",
                "请说明预算控制",
                List.of(citation("doc-1", "预算控制说明")),
                List.of(),
                100
        );

        assertThat(plan.stats().inputBudgetTokens()).isEqualTo(3000);
    }

    @Test
    void truncatesLongCitationTextWithinInputBudget() {
        PromptBudgetProperties properties = new PromptBudgetProperties();
        properties.setContextWindowTokens(1200);
        properties.setSafetyMarginTokens(100);
        properties.setMaxTokensPerCitation(220);
        properties.setMinTokensPerCitation(80);
        properties.setMaxCitations(4);
        PromptBudgetPlanner planner = new PromptBudgetPlanner(properties, tokenEstimator);

        String longText = "这是一段很长的制度正文。".repeat(180);
        List<CitationDto> citations = new ArrayList<>();
        citations.add(citation("doc-1", longText));
        citations.add(citation("doc-2", longText));

        PromptBudgetPlanner.PromptPlan plan = planner.plan(
                "system prompt",
                "试用期员工转正后的年假规则是什么？",
                citations,
                List.of(),
                256
        );

        assertThat(plan.citations()).isNotEmpty();
        assertThat(plan.stats().truncatedCitations()).isGreaterThan(0);
        assertThat(plan.stats().estimatedPromptTokens()).isLessThanOrEqualTo(plan.stats().inputBudgetTokens());
        assertThat(plan.citations().get(0).text()).contains("已省略");
    }

    @Test
    void keepsRecentHistoryWithinHistoryBudget() {
        PromptBudgetProperties properties = new PromptBudgetProperties();
        properties.setContextWindowTokens(1400);
        properties.setSafetyMarginTokens(100);
        properties.setHistoryBudgetRatio(0.2);
        properties.setMaxHistoryTurns(2);
        PromptBudgetPlanner planner = new PromptBudgetPlanner(properties, tokenEstimator);

        List<SessionService.Turn> history = List.of(
                new SessionService.Turn(1, "第一轮问题", "第一轮回答".repeat(120), 1),
                new SessionService.Turn(2, "第二轮问题", "第二轮回答".repeat(120), 2),
                new SessionService.Turn(3, "第三轮问题", "第三轮回答".repeat(20), 3)
        );

        PromptBudgetPlanner.PromptPlan plan = planner.plan(
                "system",
                "继续说明申请材料",
                List.of(citation("doc-1", "申请材料包括身份证明、审批表和相关附件。")),
                history,
                256
        );

        assertThat(plan.history()).hasSizeLessThanOrEqualTo(2);
        assertThat(plan.history()).extracting(SessionService.Turn::turnNum).contains(3);
        assertThat(plan.stats().droppedHistoryTurns()).isGreaterThan(0);
    }

    private CitationDto citation(String docId, String text) {
        return citation(docId, text, 0.9);
    }

    private CitationDto citation(String docId, String text, double score) {
        return CitationDto.builder()
                .docId(docId)
                .title("员工手册")
                .page(1)
                .sectionPath("第一章")
                .score(score)
                .text("child text")
                .parentText(text)
                .build();
    }
}
