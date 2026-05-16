package com.kb.rag.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Map;

@Data
@Component
@ConfigurationProperties(prefix = "kb.alert")
public class AlertProperties {
    private boolean enabled = true;
    private Map<String, Threshold> thresholds = Map.of(
            "error_rate", new Threshold(0.05, "错误率超过阈值"),
            "refusal_rate", new Threshold(0.20, "拒答率超过阈值"),
            "p95_latency_ms", new Threshold(5000, "P95延迟超过阈值"),
            "dead_service", new Threshold(0, "服务无请求")
    );

    @Data
    public static class Threshold {
        private double value;
        private String description;

        public Threshold() {}
        public Threshold(double value, String description) {
            this.value = value;
            this.description = description;
        }
    }
}
