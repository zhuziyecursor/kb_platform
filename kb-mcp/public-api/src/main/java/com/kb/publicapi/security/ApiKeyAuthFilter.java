package com.kb.publicapi.security;

import com.kb.publicapi.config.PublicApiProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Slf4j
@RequiredArgsConstructor
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    private final PublicApiProperties properties;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer pk-")) {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("""
                    {"code":"UNAUTHORIZED","message":"Missing or invalid API key","traceId":"tr-%s"}
                    """.formatted(UUID.randomUUID()));
            return;
        }

        String apiKey = authHeader.substring(7);
        ApiKeyConfig config = properties.getApiKeys() != null
                ? properties.getApiKeys().get(apiKey)
                : null;

        if (config == null) {
            log.warn("Invalid API key: {}", maskKey(apiKey));
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("""
                    {"code":"UNAUTHORIZED","message":"Invalid API key","traceId":"tr-%s"}
                    """.formatted(UUID.randomUUID()));
            return;
        }

        RequestContext.set(config);
        try {
            chain.doFilter(request, response);
        } finally {
            RequestContext.clear();
        }
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 11) return "***";
        return key.substring(0, 11) + "***";
    }
}
