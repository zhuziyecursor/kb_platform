package com.kb.rag.service;

import com.kb.rag.config.PromptBudgetProperties;
import com.kb.rag.dto.CitationDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PromptBudgetPlanner {

    private static final String TRUNCATED_MARKER = "\n...[内容已截断]";
    private static final String MIDDLE_OMITTED_MARKER = "\n...[中间内容已省略]...\n";

    private final PromptBudgetProperties properties;
    private final TokenEstimator tokenEstimator;

    public PromptPlan plan(String systemPrompt, String query, List<CitationDto> citations,
                           List<SessionService.Turn> sessionHistory, int reservedCompletionTokens) {
        List<CitationDto> safeCitations = citations == null ? List.of() : citations;
        List<SessionService.Turn> safeHistory = sessionHistory == null ? List.of() : sessionHistory;

        if (!properties.isEnabled()) {
            int estimatedTokens = estimatePrompt(systemPrompt, query, safeCitations, safeHistory);
            return new PromptPlan(
                    safeHistory,
                    safeCitations.stream().map(c -> new BudgetedCitation(c, citationText(c), false)).toList(),
                    new PromptBudgetStats(false, 0, estimatedTokens, safeHistory.size(), 0,
                            safeCitations.size(), 0, 0)
            );
        }

        safeCitations = safeCitations.stream()
                .sorted(Comparator.comparingDouble(CitationDto::getScore).reversed())
                .toList();

        int ratioBudget = (int) Math.floor(properties.getContextWindowTokens() * properties.getInputBudgetRatio());
        int reservedBudget = properties.getContextWindowTokens()
                - reservedCompletionTokens
                - properties.getSafetyMarginTokens();
        int inputBudget = Math.max(256, Math.min(ratioBudget, reservedBudget));
        int fixedTokens = tokenEstimator.estimate(systemPrompt)
                + tokenEstimator.estimate(query)
                + properties.getMessageOverheadTokens() * 2
                + 80;
        int remaining = Math.max(0, inputBudget - fixedTokens);

        HistoryBudget historyBudget = budgetHistory(safeHistory, remaining);
        remaining = Math.max(0, remaining - historyBudget.usedTokens());

        CitationBudget citationBudget = budgetCitations(safeCitations, remaining);
        int estimatedTokens = fixedTokens + historyBudget.usedTokens() + citationBudget.usedTokens();

        return new PromptPlan(
                historyBudget.turns(),
                citationBudget.citations(),
                new PromptBudgetStats(true, inputBudget, estimatedTokens,
                        historyBudget.turns().size(), safeHistory.size() - historyBudget.turns().size(),
                        citationBudget.citations().size(), safeCitations.size() - citationBudget.citations().size(),
                        citationBudget.truncatedCount())
        );
    }

    private HistoryBudget budgetHistory(List<SessionService.Turn> history, int remainingTokens) {
        if (history.isEmpty() || remainingTokens <= 0 || properties.getHistoryBudgetRatio() <= 0) {
            return new HistoryBudget(List.of(), 0);
        }

        int historyBudget = Math.min(remainingTokens,
                Math.max(0, (int) Math.floor(remainingTokens * properties.getHistoryBudgetRatio())));
        if (historyBudget <= 0) {
            return new HistoryBudget(List.of(), 0);
        }

        List<SessionService.Turn> selected = new ArrayList<>();
        int used = 0;
        int start = Math.max(0, history.size() - properties.getMaxHistoryTurns());
        for (int i = history.size() - 1; i >= start; i--) {
            SessionService.Turn turn = history.get(i);
            int turnTokens = turnTokens(turn);
            if (used + turnTokens <= historyBudget) {
                selected.add(turn);
                used += turnTokens;
                continue;
            }

            int queryTokens = tokenEstimator.estimate(turn.query());
            int availableForAnswer = historyBudget - used - queryTokens - properties.getMessageOverheadTokens() * 2;
            if (availableForAnswer >= 80) {
                String answer = tokenEstimator.truncateHead(turn.answer(), availableForAnswer);
                selected.add(new SessionService.Turn(turn.turnNum(), turn.query(),
                        answer + TRUNCATED_MARKER, turn.timestamp()));
                used = historyBudget;
            }
            break;
        }

        Collections.reverse(selected);
        return new HistoryBudget(selected, used);
    }

    private CitationBudget budgetCitations(List<CitationDto> citations, int remainingTokens) {
        if (citations.isEmpty() || remainingTokens <= 0) {
            return new CitationBudget(List.of(), 0, 0);
        }

        List<BudgetedCitation> selected = new ArrayList<>();
        int used = 0;
        int truncated = 0;
        int limit = Math.min(properties.getMaxCitations(), citations.size());

        for (int i = 0; i < limit; i++) {
            CitationDto citation = citations.get(i);
            String text = citationText(citation);
            int headerTokens = estimateCitationHeader(citation);
            int available = remainingTokens - used - headerTokens;
            if (available < properties.getMinTokensPerCitation()) {
                break;
            }

            int textBudget = Math.min(properties.getMaxTokensPerCitation(), available);
            boolean isTruncated = tokenEstimator.estimate(text) > textBudget;
            String budgetedText = isTruncated ? compressCitationText(text, textBudget) : text;
            int itemTokens = headerTokens + tokenEstimator.estimate(budgetedText);

            if (used + itemTokens > remainingTokens) {
                break;
            }

            selected.add(new BudgetedCitation(citation, budgetedText, isTruncated));
            used += itemTokens;
            if (isTruncated) {
                truncated++;
            }
        }

        return new CitationBudget(selected, used, truncated);
    }

    private int estimatePrompt(String systemPrompt, String query, List<CitationDto> citations,
                               List<SessionService.Turn> history) {
        int tokens = tokenEstimator.estimate(systemPrompt) + tokenEstimator.estimate(query) + 80;
        for (SessionService.Turn turn : history) {
            tokens += turnTokens(turn);
        }
        for (CitationDto citation : citations) {
            tokens += estimateCitationHeader(citation) + tokenEstimator.estimate(citationText(citation));
        }
        return tokens;
    }

    private int turnTokens(SessionService.Turn turn) {
        return tokenEstimator.estimate(turn.query())
                + tokenEstimator.estimate(turn.answer())
                + properties.getMessageOverheadTokens() * 2;
    }

    private int estimateCitationHeader(CitationDto citation) {
        return properties.getCitationHeaderOverheadTokens()
                + tokenEstimator.estimate(citation.getTitle())
                + tokenEstimator.estimate(citation.getSectionPath());
    }

    private String citationText(CitationDto citation) {
        if (citation == null) {
            return "";
        }
        String parentText = citation.getParentText();
        if (parentText != null && !parentText.isBlank()) {
            return parentText;
        }
        return citation.getText() == null ? "" : citation.getText();
    }

    private String compressCitationText(String text, int tokenBudget) {
        int markerTokens = tokenEstimator.estimate(MIDDLE_OMITTED_MARKER);
        if (tokenBudget <= 120 || tokenBudget <= markerTokens + 40) {
            int contentBudget = Math.max(1, tokenBudget - tokenEstimator.estimate(TRUNCATED_MARKER));
            return tokenEstimator.truncateHead(text, contentBudget) + TRUNCATED_MARKER;
        }

        int contentBudget = tokenBudget - markerTokens;
        int headBudget = Math.max(1, (int) Math.floor(contentBudget * 0.7));
        int tailBudget = Math.max(1, contentBudget - headBudget);
        return tokenEstimator.truncateHead(text, headBudget)
                + MIDDLE_OMITTED_MARKER
                + tokenEstimator.truncateTail(text, tailBudget);
    }

    public record PromptPlan(
            List<SessionService.Turn> history,
            List<BudgetedCitation> citations,
            PromptBudgetStats stats
    ) {}

    public record BudgetedCitation(
            CitationDto citation,
            String text,
            boolean truncated
    ) {}

    public record PromptBudgetStats(
            boolean enabled,
            int inputBudgetTokens,
            int estimatedPromptTokens,
            int includedHistoryTurns,
            int droppedHistoryTurns,
            int includedCitations,
            int droppedCitations,
            int truncatedCitations
    ) {}

    private record HistoryBudget(List<SessionService.Turn> turns, int usedTokens) {}

    private record CitationBudget(List<BudgetedCitation> citations, int usedTokens, int truncatedCount) {}
}
