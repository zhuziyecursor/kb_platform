package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.LlmGatewayRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PromptConstructionService {

    private final PromptBudgetPlanner promptBudgetPlanner;

    @Value("${app.llm.temperature}")
    private double temperature;

    @Value("${app.llm.max-tokens}")
    private int maxTokens;

    @Value("${app.llm.model}")
    private String model;

    private static final String SYSTEM_PROMPT = """
            你是企业内部 AI 编程与审计顾问，服务技术和业务团队。
            工作领域：AI 辅助编程（代码生成、Code Review、Agent 开发）、审计知识（会计准则、内控合规、审计方法论）。

            ## 核心原则
            - 重组不删减：合并提炼多段资料，保留所有关键信息。
            - 降维不降准：用工程师能理解的语言翻译晦涩规范，不丢失约束。
            - 补充要标注：经验建议用「💡 实践建议」标识，与知识库内容区分。

            ## 回答结构
            ### 核心结论
            1-2 句话直接回答，禁止"根据资料"、"参考资料显示"等套话开头。

            ### 详细说明
            结构化解读知识库内容，重组信息顺序，合并去重，用 [1]、[2] 标注引用。

            ### 实践建议
            1-2 条可操作 tip，经验补充需注明来源。

            ### 你可能还想了解
            3 个追问方向，每行一个 "- 追问内容"：
            - 纵向深入细节
            - 横向关联话题
            - 实际落地问题

            ## 风格约束
            - 首句必须直接结论
            - 每个要点不超过 3 句话
            - 有数据给数据，有步骤给步骤
            - 禁止"众所周知"、"随着技术发展"等废话
            - 用工程师和审计人员熟悉的语言

            ## 边界规则
            - 无相关信息时回复"知识库中暂时没有找到相关资料"
            - 不编造知识库外的事实
            - 部分覆盖时先回答已知，再说明未找到的内容

            ## 置信度自评（最后一行独占）
            - [CONFIDENCE: HIGH] — 资料完全覆盖
            - [CONFIDENCE: MEDIUM] — 资料部分覆盖
            - [CONFIDENCE: LOW] — 资料相关性弱
            """;

    public LlmGatewayRequest buildPrompt(String query, List<CitationDto> citations,
                                          List<SessionService.Turn> sessionHistory) {
        return buildPromptWithBudget(query, citations, sessionHistory, null).request();
    }

    public BuildResult buildPromptWithBudget(String query, List<CitationDto> citations,
                                             List<SessionService.Turn> sessionHistory) {
        return buildPromptWithBudget(query, citations, sessionHistory, null);
    }

    public BuildResult buildPromptWithBudget(String query, List<CitationDto> citations,
                                             List<SessionService.Turn> sessionHistory,
                                             String systemPromptOverride) {
        String systemPrompt = StringUtils.hasText(systemPromptOverride)
                ? systemPromptOverride
                : SYSTEM_PROMPT;
        PromptBudgetPlanner.PromptPlan promptPlan = promptBudgetPlanner.plan(
                systemPrompt, query, citations, sessionHistory, maxTokens);

        StringBuilder userContent = new StringBuilder();
        userContent.append("问题：").append(query).append("\n\n");
        userContent.append("参考资料：\n");
        for (int i = 0; i < promptPlan.citations().size(); i++) {
            PromptBudgetPlanner.BudgetedCitation budgetedCitation = promptPlan.citations().get(i);
            CitationDto c = budgetedCitation.citation();
            userContent.append("[").append(i + 1).append("] ");
            userContent.append("来源：").append(c.getTitle())
                    .append("（第").append(c.getPage()).append("页");
            if (c.getSectionPath() != null && !c.getSectionPath().isEmpty()) {
                userContent.append("，").append(c.getSectionPath());
            }
            userContent.append("）\n");
            userContent.append("内容：").append(budgetedCitation.text()).append("\n\n");
        }

        List<LlmGatewayRequest.Message> messages = new ArrayList<>();
        messages.add(LlmGatewayRequest.Message.builder()
                .role("system")
                .content(systemPrompt)
                .build());

        if (promptPlan.history() != null) {
            for (SessionService.Turn turn : promptPlan.history()) {
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

        LlmGatewayRequest request = LlmGatewayRequest.builder()
                .model(model)
                .messages(messages)
                .temperature(temperature)
                .maxTokens(maxTokens)
                .build();

        PromptBudgetPlanner.PromptBudgetStats stats = promptPlan.stats();
        log.info("Prompt budget enabled={} inputBudgetTokens={} estimatedPromptTokens={} "
                        + "includedCitations={} droppedCitations={} truncatedCitations={} "
                        + "includedHistoryTurns={} droppedHistoryTurns={}",
                stats.enabled(), stats.inputBudgetTokens(), stats.estimatedPromptTokens(),
                stats.includedCitations(), stats.droppedCitations(), stats.truncatedCitations(),
                stats.includedHistoryTurns(), stats.droppedHistoryTurns());

        return new BuildResult(
                request,
                promptPlan.citations().stream()
                        .map(PromptBudgetPlanner.BudgetedCitation::citation)
                        .collect(Collectors.toList()),
                stats
        );
    }

    public record BuildResult(
            LlmGatewayRequest request,
            List<CitationDto> citations,
            PromptBudgetPlanner.PromptBudgetStats stats
    ) {
    }
}
