package com.kb.llm.service;

import com.kb.llm.dto.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MinimaxProviderService {

    private final RestTemplate restTemplate;

    @Value("${app.minimax.api-base}")
    private String apiBase;

    @Value("${app.minimax.api-key}")
    private String apiKey;

    @Value("${app.minimax.model}")
    private String model;

    @Value("${app.minimax.temperature}")
    private double temperature;

    @Value("${app.minimax.max-tokens}")
    private int maxTokens;

    public MinimaxResponse chat(MinimaxRequest request) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bearer " + apiKey);

        HttpEntity<MinimaxRequest> entity = new HttpEntity<>(request, headers);

        try {
            ResponseEntity<MinimaxResponse> response = restTemplate.exchange(
                    apiBase,
                    HttpMethod.POST,
                    entity,
                    MinimaxResponse.class
            );

            MinimaxResponse body = response.getBody();
            if (body == null) {
                throw new RuntimeException("MiniMax returned empty response");
            }
            if (!body.isSuccess()) {
                throw new RuntimeException("MiniMax API error [" + body.getBaseResp().getStatusCode() + "]: " + body.errorMessage());
            }
            return body;
        } catch (RestClientException e) {
            log.error("MiniMax API call failed: {}", e.getMessage());
            throw new RuntimeException("MiniMax API error: " + e.getMessage(), e);
        }
    }

    public MinimaxRequest buildRequest(ChatCompletionRequest request) {
        MinimaxRequest req = new MinimaxRequest();
        req.setModel(request.getModel() != null ? request.getModel() : model);
        req.setTemperature(request.getTemperature() != null ? request.getTemperature() : temperature);
        req.setMaxTokens(request.getMaxTokens() != null ? request.getMaxTokens() : maxTokens);
        req.setMessages(
                request.getMessages().stream()
                        .map(m -> MinimaxRequest.MinimaxMessage.builder()
                                .role(m.getRole())
                                .content(m.getContent())
                                .build())
                        .collect(Collectors.toList())
        );
        return req;
    }
}
