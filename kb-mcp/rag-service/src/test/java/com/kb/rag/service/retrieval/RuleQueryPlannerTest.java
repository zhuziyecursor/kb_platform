package com.kb.rag.service.retrieval;

import org.junit.jupiter.api.Test;

import java.util.List;

import static com.kb.rag.service.retrieval.RetrievalPlan.ChannelId.*;
import static org.assertj.core.api.Assertions.assertThat;

class RuleQueryPlannerTest {

    private final RuleQueryPlanner planner = new RuleQueryPlanner();

    @Test
    void clauseQuery_yieldsPolicyQaWithStructuredChannel() {
        RetrievalPlan plan = planner.plan("tenant-a", "第32条规定了什么", List.of());

        assertThat(plan.queryType()).isEqualTo(RetrievalPlan.QueryType.POLICY_QA);
        assertThat(plan.clauseRefs()).contains("第32条");
        assertThat(plan.enabledChannels()).contains(DENSE, SPARSE, FAQ, STRUCTURED);
    }

    @Test
    void howToQuery_yieldsProcedure() {
        RetrievalPlan plan = planner.plan("tenant-a", "如何申请加班补贴", List.of());

        assertThat(plan.queryType()).isEqualTo(RetrievalPlan.QueryType.PROCEDURE);
        assertThat(plan.enabledChannels()).doesNotContain(STRUCTURED);
    }

    @Test
    void definitionQuery_yieldsDefinition() {
        RetrievalPlan plan = planner.plan("tenant-a", "什么是审计风险", List.of());

        assertThat(plan.queryType()).isEqualTo(RetrievalPlan.QueryType.DEFINITION);
    }

    @Test
    void plainQuery_yieldsOther_andSkipsStructured() {
        RetrievalPlan plan = planner.plan("tenant-a", "出差报销标准", List.of());

        assertThat(plan.queryType()).isEqualTo(RetrievalPlan.QueryType.OTHER);
        assertThat(plan.enabledChannels()).doesNotContain(STRUCTURED);
        assertThat(plan.enabledChannels()).contains(DENSE, SPARSE, FAQ);
    }

    @Test
    void westernClauseNotation_isCaptured() {
        RetrievalPlan plan = planner.plan("tenant-a", "3.2.1 节如何描述风险点", List.of());

        // Western clause patterns trigger STRUCTURED
        assertThat(plan.clauseRefs()).contains("3.2.1");
        assertThat(plan.enabledChannels()).contains(STRUCTURED);
    }
}
