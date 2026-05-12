package com.kb.publicapi.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate ingestRestTemplate(PublicApiProperties props) {
        var ingest = props.getClient().getIngestService();
        return new RestTemplateBuilder()
                .setConnectTimeout(Duration.ofSeconds(ingest.getConnectTimeoutSeconds()))
                .setReadTimeout(Duration.ofSeconds(ingest.getReadTimeoutSeconds()))
                .build();
    }

    @Bean
    public RestTemplate ragRestTemplate(PublicApiProperties props) {
        var rag = props.getClient().getRagService();
        return new RestTemplateBuilder()
                .setConnectTimeout(Duration.ofSeconds(rag.getConnectTimeoutSeconds()))
                .setReadTimeout(Duration.ofSeconds(rag.getReadTimeoutSeconds()))
                .build();
    }

    @Bean
    public RestTemplate minioRestTemplate(PublicApiProperties props) {
        var minio = props.getClient().getMinio();
        return new RestTemplateBuilder()
                .setConnectTimeout(Duration.ofSeconds(minio.getConnectTimeoutSeconds()))
                .setReadTimeout(Duration.ofSeconds(minio.getReadTimeoutSeconds()))
                .build();
    }
}
