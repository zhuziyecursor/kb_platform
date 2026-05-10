package com.kb.llm.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.llm.dto.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.function.Consumer;
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

    @Value("${app.minimax.timeout-seconds}")
    private int timeoutSeconds;

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

    /**
     * Streaming chat: reads MiniMax SSE stream and pushes tokens via onToken callback.
     */
    public void chatStream(MinimaxRequest request, Consumer<String> onToken) throws Exception {
        request.setStream(true);

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        ObjectMapper mapper = new ObjectMapper();

        HttpRequest httpReq = HttpRequest.newBuilder()
                .uri(URI.create(apiBase))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(request)))
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .build();

        HttpResponse<InputStream> response = client.send(httpReq, HttpResponse.BodyHandlers.ofInputStream());

        if (response.statusCode() != 200) {
            String err = new String(response.body().readAllBytes());
            throw new RuntimeException("MiniMax stream failed [" + response.statusCode() + "]: " + err);
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("data: ")) continue;
                String data = line.substring(6).trim();
                if ("[DONE]".equals(data)) break;
                try {
                    JsonNode root = mapper.readTree(data);
                    JsonNode choices = root.path("choices");
                    if (choices.isArray() && choices.size() > 0) {
                        JsonNode delta = choices.get(0).path("delta");
                        String token = delta.path("content").asText("");
                        if (!token.isEmpty()) {
                            onToken.accept(token);
                        }
                    }
                } catch (Exception e) {
                    log.debug("Skip unparseable SSE line: {}", data);
                }
            }
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
