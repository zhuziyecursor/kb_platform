package com.kb.rag.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app.llm.prompt-budget")
public class PromptBudgetProperties {

    private boolean enabled = true;

    /**
     * Total model context window. Keep this configurable because model/provider limits vary.
     */
    private int contextWindowTokens = 8192;

    /**
     * Reserved buffer to absorb tokenizer estimation error and provider-side message overhead.
     */
    private int safetyMarginTokens = 512;

    /**
     * Upper bound for prompt input budget as a ratio of the context window.
     */
    private double inputBudgetRatio = 0.75;

    private double historyBudgetRatio = 0.15;

    private int maxHistoryTurns = 6;

    private int maxCitations = 8;

    private int maxTokensPerCitation = 900;

    private int minTokensPerCitation = 120;

    private int messageOverheadTokens = 8;

    private int citationHeaderOverheadTokens = 40;
}
