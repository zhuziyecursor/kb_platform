package com.kb.rag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.dto.LlmGatewayRequest;
import com.kb.rag.dto.LlmGatewayResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

@Slf4j
@Service
@RequiredArgsConstructor
public class LlmGatewayClient {

    private final RestTemplate restTemplate;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${app.llm.url}")
    private String llmUrl;

    @Value("${app.llm.max-retries}")
    private int maxRetries;

    public String generate(LlmGatewayRequest request, String traceId, String tenantId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Trace-Id", traceId);
        headers.set("X-Tenant-Id", tenantId);
        HttpEntity<LlmGatewayRequest> entity = new HttpEntity<>(request, headers);

        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                ResponseEntity<LlmGatewayResponse> response = restTemplate.postForEntity(
                        llmUrl, entity, LlmGatewayResponse.class);

                if (response.getBody() != null
                        && response.getBody().getChoice() != null
                        && response.getBody().getChoice().getMessage() != null) {
                    return response.getBody().getChoice().getMessage().getContent();
                }
                throw new RuntimeException("Empty LLM response");
            } catch (RestClientException e) {
                log.warn("LLM gateway attempt {}/{} failed: {}", attempt + 1, maxRetries, e.getMessage());
                if (attempt == maxRetries - 1) {
                    throw new RuntimeException("LLM gateway error after " + maxRetries + " retries", e);
                }
                sleep(1L << attempt);
            }
        }
        throw new RuntimeException("LLM gateway unreachable");
    }

    /**
     * Streaming generation: connects to llm-gateway SSE endpoint and pushes tokens via onToken.
     * Uses RestTemplate for consistent serialization with generate() and reads SSE from response.
     */
    public void generateStream(LlmGatewayRequest request, String traceId, String tenantId,
                               Consumer<String> onToken) throws Exception {
        // Build request with stream flag — serialized identically to generate()
        LlmGatewayRequest streamRequest = LlmGatewayRequest.builder()
                .model(request.getModel())
                .messages(request.getMessages())
                .temperature(request.getTemperature())
                .maxTokens(request.getMaxTokens())
                .build();

        ObjectMapper mapper = new ObjectMapper();
        // Serialize the typed object to ensure correct field naming, adding stream=true
        String jsonBody = mapper.writeValueAsString(streamRequest);
        // Insert stream flag before closing brace
        jsonBody = jsonBody.substring(0, jsonBody.length() - 1) + ",\"stream\":true}";
        log.info("LLM stream request size={} model={} temp={} maxTokens={}",
                jsonBody.length(), request.getModel(), request.getTemperature(), request.getMaxTokens());

        HttpRequest httpReq = HttpRequest.newBuilder()
                .uri(URI.create(llmUrl + "/stream"))
                .header("Content-Type", "application/json")
                .header("X-Trace-Id", traceId)
                .header("X-Tenant-Id", tenantId)
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .timeout(Duration.ofSeconds(90))
                .build();

        HttpResponse<InputStream> response = httpClient.send(httpReq, HttpResponse.BodyHandlers.ofInputStream());
        log.info("LLM stream response status={}", response.statusCode());

        if (response.statusCode() != 200) {
            String err = new String(response.body().readAllBytes());
            log.error("LLM stream error response: {}", err);
            throw new RuntimeException("LLM stream failed [" + response.statusCode() + "]: " + err);
        }

        int tokenCount = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body()))) {
            String line;
            String currentEvent = null;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("event:")) {
                    currentEvent = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    String data = line.substring(5).trim();
                    if ("token".equals(currentEvent)) {
                        try {
                            JsonNode node = mapper.readTree(data);
                            String token = node.path("token").asText("");
                            if (!token.isEmpty()) {
                                tokenCount++;
                                onToken.accept(token);
                            }
                        } catch (Exception e) {
                            log.debug("Skip unparseable token data: {}", data);
                        }
                    } else if ("done".equals(currentEvent)) {
                        log.info("LLM stream done received, tokenCount={}", tokenCount);
                        break;
                    } else if ("error".equals(currentEvent)) {
                        log.error("LLM stream error event: {}", data);
                        break;
                    }
                    currentEvent = null;
                } else if (line.isEmpty()) {
                    currentEvent = null;
                }
            }
        }
        log.info("LLM stream ended, tokenCount={}", tokenCount);
    }

    private void sleep(long seconds) {
        try {
            Thread.sleep(seconds * 1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
