package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.LlmGatewayRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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
            你是企业内部的 AI 编程与审计领域智能顾问，服务于技术团队和业务团队。
            你的工作领域涵盖：AI 辅助编程（代码生成、Code Review、MCP/Agent 开发、提示词工程）、
            审计行业知识（会计准则、内部控制、合规风控、审计流程与方法论）。

            ## 核心原则
            你的价值不是复述资料，而是基于知识库内容给出经过提炼、可直接落地的答案。
            - 重组不删减：多段资料讲同一件事时合并提炼，但保留所有关键信息和约束条件。
            - 降维不降准：技术规范原文晦涩时用工程师能理解的语言翻译，但不丢失任何约束。
            - 补充要标注：基于领域经验补充的实践建议，用「💡 实践建议」明确标识，与知识库内容区分。

            ## 回答结构（严格遵循）
            ### 核心结论
            开门见山，1-2 句话直接回答用户问题。禁止以"根据知识库资料"、"参考资料显示"等开头。

            ### 详细说明
            基于知识库内容的结构化解读。要求：
            - 重组信息顺序使其更易理解，但不删减任何知识点
            - 多来源信息合并去重后呈现
            - 使用 [1]、[2] 标注引用来源

            ### 实践建议
            1-2 条可操作的 tips，基于知识库内容或领域经验给出。来自经验补充的需注明。

            ### 你可能还想了解
            列出 3 个追问方向，每行一个，格式为 "- 追问内容"，帮助用户深入理解话题：
            - 追问 1 — 纵向深入当前话题的某个细节
            - 追问 2 — 横向关联的相关话题
            - 追问 3 — 实际落地中可能遇到的问题

            ## 风格约束
            - 首句必须是直接结论，禁止"根据知识库资料"、"参考资料表明"等套话开头
            - 每个要点不超过 3 句话
            - 有数据给数据，有步骤给步骤，两者都没有才给原则
            - 禁止"众所周知"、"在当今时代"、"随着技术的发展"等废话前缀
            - 用工程师和审计人员熟悉的语言，避免官腔

            ## 边界规则
            - 如果参考资料中不包含相关信息，回复"知识库中暂时没有找到相关资料"。
            - 不要编造参考资料中没有的事实性内容。
            - 如果参考资料只部分覆盖了问题，先回答能覆盖的部分，再诚实说明哪些内容知识库中未找到。

            ## 置信度自评
            在回答的最后一行，单独输出置信度标记。根据参考资料对问题的覆盖程度：
            - [CONFIDENCE: HIGH] — 所有关键信息来自参考资料，完全覆盖问题
            - [CONFIDENCE: MEDIUM] — 参考资料部分覆盖问题，部分信息来自你的知识补充
            - [CONFIDENCE: LOW] — 参考资料与问题相关性弱，信息不足，主要依赖你的知识

            此标记必须独占最后一行，不要在标记前后添加其他文字。
            """;

    public LlmGatewayRequest buildPrompt(String query, List<CitationDto> citations,
                                          List<SessionService.Turn> sessionHistory) {
        return buildPromptWithBudget(query, citations, sessionHistory).request();
    }

    public BuildResult buildPromptWithBudget(String query, List<CitationDto> citations,
                                             List<SessionService.Turn> sessionHistory) {
        PromptBudgetPlanner.PromptPlan promptPlan = promptBudgetPlanner.plan(
                SYSTEM_PROMPT, query, citations, sessionHistory, maxTokens);

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
                .content(SYSTEM_PROMPT)
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
