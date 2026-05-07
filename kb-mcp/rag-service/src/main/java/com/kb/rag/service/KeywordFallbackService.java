package com.kb.rag.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

@Slf4j
@Service
public class KeywordFallbackService {

    private static final Pattern CLAUSE_PATTERN = Pattern.compile(
            "第[\\d一二三四五六七八九十百千]+([.．、][\\d一二三四五六七八九十]+)*[条章节]");

    public String enhanceQuery(String query) {
        StringBuilder keywords = new StringBuilder();

        var matcher = CLAUSE_PATTERN.matcher(query);
        while (matcher.find()) {
            String clause = matcher.group();
            keywords.append(" \"").append(clause).append("\"");
        }

        if (keywords.length() > 0) {
            return query + " " + keywords.toString().trim();
        }
        return query;
    }
}
