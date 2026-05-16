package com.kb.rag.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app.eval")
public class EvalProperties {

    /** Chunk size in characters for text splitting */
    private int chunkSize = 800;

    /** Overlap between consecutive chunks in characters */
    private int chunkOverlap = 100;

    /** Number of chunks to send per LLM batch call */
    private int qaBatchSize = 20;

    /** Maximum QA pairs to generate per source file */
    private int maxQaPerFile = 50;

    /** LLM model used for QA generation */
    private String generatorModel = "MiniMax-M2.7";

    /** Temperature for QA generation */
    private double generatorTemperature = 0.7;

    /** Max tokens per QA generation call */
    private int generatorMaxTokens = 4096;

    /** Number of concurrent eval requests when running evaluation */
    private int evalParallelism = 4;

    /** LLM model used as judge for evaluation */
    private String judgeModel = "MiniMax-M2.7";
}
