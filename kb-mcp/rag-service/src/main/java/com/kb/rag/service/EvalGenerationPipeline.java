package com.kb.rag.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.config.EvalProperties;
import com.kb.rag.dto.LlmGatewayRequest;
import com.kb.rag.dto.StageEvent;
import com.kb.rag.entity.EvalDataset;
import com.kb.rag.entity.EvalQaPair;
import com.kb.rag.repository.EvalDatasetRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EvalGenerationPipeline {

    private final EvalDatasetRepository datasetRepo;
    private final EvalDatasetService datasetService;
    private final LlmGatewayClient llmGatewayClient;
    private final EvalProperties evalProperties;
    private final ObjectMapper objectMapper;

    private static final Pattern HTML_TAG = Pattern.compile("<[^>]*>");
    private static final Pattern HTML_ENTITY = Pattern.compile("&[a-z]+;|&#\\d+;");
    private static final Pattern MULTI_NEWLINE = Pattern.compile("\\n{3,}");

    // Process files in batches to keep memory use bounded
    private static final int MAX_CHUNK_BUFFER = 120;
    private static final long MAX_FILE_SIZE_BYTES = 1_000_000; // skip files > 1MB
    private static final int MAX_TEXT_LENGTH = 2_000_000; // skip files whose extracted text > 2M chars
    private static final int MAX_CHUNKS_PER_FILE = 5000; // safety cap per file

    public void execute(String datasetId,
                        Consumer<StageEvent> onStage,
                        Consumer<Map<String, Object>> onComplete,
                        Consumer<Exception> onError) {
        long pipelineStart = System.currentTimeMillis();
        String traceId = "tr-" + UUID.randomUUID().toString();

        // Diagnostic: log heap state before pipeline
        Runtime rt = Runtime.getRuntime();
        long heapUsed = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
        long heapMax = rt.maxMemory() / (1024 * 1024);
        log.info("Pipeline {}: START heap used={}MB max={}MB", traceId, heapUsed, heapMax);

        // Force GC to free any reclaimable memory before starting
        System.gc();
        try { Thread.sleep(500); } catch (InterruptedException ignored) {}
        long heapAfterGc = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
        log.info("Pipeline {}: AFTER GC heap used={}MB", traceId, heapAfterGc);

        try {
            EvalDataset ds = datasetRepo.findByDatasetId(datasetId)
                    .orElseThrow(() -> new NoSuchElementException("Dataset not found: " + datasetId));
            ds.setTraceId(traceId);
            ds.setStatus("GENERATING");
            datasetRepo.save(ds);

            // Stage 1: Discover HTML files (paths only, no content loaded)
            List<Path> htmlFiles = runStage("DISCOVER_FILES", pipelineStart, onStage, () ->
                    discoverHtmlFiles(ds.getSourcePath(), datasetId, onStage));
            log.info("Pipeline {}: discovered {} HTML files", traceId, htmlFiles.size());

            // Stage 2: Stream-parse & chunk files one by one, generate QA incrementally
            GenerationState state = runStage("PARSE_AND_CHUNK", pipelineStart, onStage, () ->
                    streamProcessFiles(htmlFiles, traceId, ds.getTenantId(), datasetId, pipelineStart, onStage));
            log.info("Pipeline {}: parsed {} files, {} chunks, generated {} raw QAs",
                    traceId, state.fileCount, state.totalChunks, state.rawQaCount);

            // Stage 3: Final validation pass
            int validatedCount = runStage("VALIDATE_QA", pipelineStart, onStage, () ->
                    validateAndDedup(state.allQas, onStage));
            log.info("Pipeline {}: validated {} QAs ({} duplicates removed)",
                    traceId, validatedCount, state.rawQaCount - validatedCount);

            // Stage 4: Finalize (all QAs were already stored incrementally)
            runStage("FINALIZE", pipelineStart, onStage, () -> null);

            long totalMs = System.currentTimeMillis() - pipelineStart;
            EvalDataset finalDs = datasetRepo.findByDatasetId(datasetId).orElseThrow();
            finalDs.setStatus("COMPLETED");
            finalDs.setTotalChunks(state.totalChunks);
            finalDs.setTotalQaPairs(validatedCount);
            finalDs.setFileCount(state.fileCount);
            finalDs.setProgress(objectMapper.writeValueAsString(Map.of(
                    "stage", "COMPLETED",
                    "completedQa", validatedCount,
                    "totalQa", validatedCount,
                    "totalChunks", state.totalChunks,
                    "fileCount", state.fileCount,
                    "completedAt", Instant.now().toString()
            )));
            datasetRepo.save(finalDs);

            onComplete.accept(Map.of(
                    "datasetId", datasetId,
                    "totalQa", validatedCount,
                    "durationMs", totalMs
            ));

        } catch (Exception e) {
            log.error("Pipeline failed for dataset {}: {}", datasetId, e.getMessage(), e);
            try {
                EvalDataset ds = datasetRepo.findByDatasetId(datasetId).orElse(null);
                if (ds != null) {
                    ds.setStatus("FAILED");
                    ds.setProgress(objectMapper.writeValueAsString(Map.of("error", e.getMessage())));
                    datasetRepo.save(ds);
                }
            } catch (Exception ignored) {}
            onError.accept(e);
        }
    }

    // ==================== Stage 1: Discover files ====================

    private List<Path> discoverHtmlFiles(String sourcePath, String datasetId,
                                          Consumer<StageEvent> onStage) throws IOException {
        Path root = Paths.get(sourcePath);
        if (!Files.exists(root)) {
            throw new IllegalArgumentException("Source path does not exist: " + sourcePath);
        }

        List<Path> files = new ArrayList<>();
        AtomicInteger count = new AtomicInteger(0);

        if (Files.isDirectory(root)) {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    String name = file.getFileName().toString().toLowerCase();
                    if (name.endsWith(".html") || name.endsWith(".htm")) {
                        files.add(file);
                        count.incrementAndGet();
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    log.warn("Cannot access file: {}", file);
                    return FileVisitResult.CONTINUE;
                }
            });
        } else {
            // Single file
            String name = root.getFileName().toString().toLowerCase();
            if (name.endsWith(".html") || name.endsWith(".htm")) {
                files.add(root);
                count.incrementAndGet();
            }
        }

        datasetService.updateProgress(datasetId, "GENERATING", 0, 0,
                Map.of("stage", "DISCOVER_FILES", "fileCount", count.get()));
        return files;
    }

    // ==================== Stage 2: Stream process files ====================

    private GenerationState streamProcessFiles(List<Path> htmlFiles, String traceId,
                                                String tenantId, String datasetId,
                                                long pipelineStart, Consumer<StageEvent> onStage) {
        int batchSize = evalProperties.getQaBatchSize();
        GenerationState state = new GenerationState();
        List<Map<String, Object>> chunkBuffer = new ArrayList<>(MAX_CHUNK_BUFFER);

        for (int i = 0; i < htmlFiles.size(); i++) {
            Path file = htmlFiles.get(i);
            state.fileCount = i + 1;

            try {
                // Skip files that are too large
                long fileSize = Files.size(file);
                if (fileSize > MAX_FILE_SIZE_BYTES) {
                    log.info("Skipping large file ({}KB): {}", fileSize / 1024, file.getFileName());
                    continue;
                }

                // Parse single file
                String raw = Files.readString(file, StandardCharsets.UTF_8);
                log.debug("Pipeline {}: file={} rawSize={} fileSize={}", traceId, file.getFileName(), raw.length(), fileSize);
                String text = extractText(raw);
                log.debug("Pipeline {}: extracted text length={}", traceId, text.length());
                if (text.length() > MAX_TEXT_LENGTH) {
                    log.warn("Pipeline {}: skipping file {} (extracted text {} chars exceeds limit {})",
                            traceId, file.getFileName(), text.length(), MAX_TEXT_LENGTH);
                    text = null;
                    raw = null;
                    continue;
                }
                if (text.length() < 100) {
                    log.debug("Pipeline {}: skipping file (text too short: {} chars)", traceId, text.length());
                    text = null;
                    raw = null;
                    continue;
                }

                // Chunk single file
                log.debug("Pipeline {}: chunking with chunkSize={} overlap={}", traceId,
                        evalProperties.getChunkSize(), evalProperties.getChunkOverlap());
                List<Map<String, Object>> fileChunks = chunkSingleDoc(
                        text, file.toString(), file.getFileName().toString(), state.totalChunks);
                state.totalChunks += fileChunks.size();
                chunkBuffer.addAll(fileChunks);

                // Release references to help GC
                raw = null;
                text = null;

                // When buffer is full enough, generate QAs
                if (chunkBuffer.size() >= MAX_CHUNK_BUFFER) {
                    List<Map<String, Object>> batchQas = generateQaFromBuffer(
                            new ArrayList<>(chunkBuffer), traceId, tenantId, onStage, pipelineStart,
                            state.allQas.size());
                    state.allQas.addAll(batchQas);
                    // Store incrementally
                    if (!batchQas.isEmpty()) {
                        storeQaPairs(datasetId, batchQas);
                    }
                    state.rawQaCount = state.allQas.size();
                    chunkBuffer.clear();
                }

                // Progress update every 50 files
                if (i % 50 == 0) {
                    emitProgress(state, pipelineStart, onStage);
                }

            } catch (OutOfMemoryError oom) {
                log.error("OOM processing file {}, skipping and forcing GC", file.getFileName());
                chunkBuffer.clear();
                System.gc();
            } catch (Exception e) {
                log.warn("Failed to process file {}: {}", file, e.getMessage());
                // Continue with next file — don't fail the whole pipeline
            }
        }

        // Process remaining chunks in buffer
        if (!chunkBuffer.isEmpty()) {
            List<Map<String, Object>> batchQas = generateQaFromBuffer(
                    chunkBuffer, traceId, tenantId, onStage, pipelineStart, state.allQas.size());
            state.allQas.addAll(batchQas);
            if (!batchQas.isEmpty()) {
                storeQaPairs(datasetId, batchQas);
            }
            state.rawQaCount = state.allQas.size();
        }

        datasetService.updateProgress(datasetId, "GENERATING", state.totalChunks, state.rawQaCount,
                Map.of("stage", "PARSE_AND_CHUNK", "fileCount", state.fileCount,
                        "totalChunks", state.totalChunks, "rawQaCount", state.rawQaCount));
        return state;
    }

    private void emitProgress(GenerationState state, long pipelineStart, Consumer<StageEvent> onStage) {
        onStage.accept(StageEvent.builder()
                .stage("PARSE_AND_CHUNK")
                .status("RUNNING")
                .elapsedMs(System.currentTimeMillis() - pipelineStart)
                .durationMs(0)
                .summary(Map.of(
                        "fileCount", state.fileCount,
                        "totalChunks", state.totalChunks,
                        "rawQaCount", state.rawQaCount
                ))
                .build());
    }

    // ==================== Single-file chunking ====================

    private List<Map<String, Object>> chunkSingleDoc(String text, String sourceFile,
                                                      String sourceFileName, int startIdx) {
        int chunkSize = evalProperties.getChunkSize();
        if (chunkSize < 100) chunkSize = 800; // defensive floor
        int overlap = Math.min(evalProperties.getChunkOverlap(), chunkSize / 2);
        log.debug("chunkSingleDoc: textLen={} chunkSize={} overlap={}", text.length(), chunkSize, overlap);
        List<Map<String, Object>> chunks = new ArrayList<>();
        int localIdx = 0;

        int pos = 0;
        while (pos < text.length()) {
            if (localIdx >= MAX_CHUNKS_PER_FILE) {
                log.warn("chunkSingleDoc: truncated {} at {} chunks (textLen={})",
                        sourceFileName, MAX_CHUNKS_PER_FILE, text.length());
                break;
            }
            int end = Math.min(pos + chunkSize, text.length());
            if (end < text.length()) {
                int breakPt = text.lastIndexOf('\n', end);
                if (breakPt > pos + chunkSize / 2) end = breakPt;
            }
            String chunkText = text.substring(pos, end).strip();
            if (chunkText.length() >= 50) {
                Map<String, Object> chunk = new LinkedHashMap<>();
                chunk.put("chunkId", "chk-" + (startIdx + localIdx));
                chunk.put("text", chunkText);
                chunk.put("charCount", chunkText.length());
                chunk.put("sourceFile", sourceFile);
                chunk.put("sourceFileName", sourceFileName);
                chunks.add(chunk);
                localIdx++;
            }
            // Advance position; break when we've consumed the entire text
            if (end >= text.length()) break;
            pos = end - overlap;
        }
        return chunks;
    }

    // ==================== QA Generation (called incrementally) ====================

    private List<Map<String, Object>> generateQaFromBuffer(List<Map<String, Object>> chunkBuffer,
                                                            String traceId, String tenantId,
                                                            Consumer<StageEvent> onStage,
                                                            long pipelineStart, int existingQaCount) {
        int batchSize = evalProperties.getQaBatchSize();
        List<Map<String, Object>> allQas = new ArrayList<>();

        Collections.shuffle(chunkBuffer);
        for (int i = 0; i < chunkBuffer.size(); i += batchSize) {
            int end = Math.min(i + batchSize, chunkBuffer.size());
            List<Map<String, Object>> batchChunks = chunkBuffer.subList(i, end);
            String batchText = batchChunks.stream()
                    .map(c -> "[chunk:" + c.get("chunkId") + "] " + c.get("text"))
                    .collect(Collectors.joining("\n\n---\n\n"));

            try {
                String response = llmGatewayClient.generate(
                        buildQaGenerationRequest(batchText), traceId, tenantId);
                List<Map<String, Object>> batchQas = parseQaResponse(response, batchChunks);
                allQas.addAll(batchQas);
            } catch (Exception e) {
                log.warn("QA generation batch failed: {}", e.getMessage());
            }
        }
        return allQas;
    }

    // ==================== Stage 3: Final validation ====================

    private int validateAndDedup(List<Map<String, Object>> qas, Consumer<StageEvent> onStage) {
        Set<String> seenQuestions = new HashSet<>();
        List<Map<String, Object>> valid = new ArrayList<>();

        for (Map<String, Object> qa : qas) {
            String question = ((String) qa.getOrDefault("question", "")).strip();
            String answer = ((String) qa.getOrDefault("answer", "")).strip();
            String normalizedQ = question.replaceAll("\\s+", "");

            if (question.length() < 5 || question.length() > 500) continue;
            if (answer.length() < 10 || answer.length() > 3000) continue;
            if (seenQuestions.contains(normalizedQ)) continue;
            seenQuestions.add(normalizedQ);
            qa.put("question", question);
            qa.put("answer", answer);
            valid.add(qa);
        }

        // Replace the list in-place
        qas.clear();
        qas.addAll(valid);

        onStage.accept(StageEvent.builder()
                .stage("VALIDATE_QA")
                .status("SUCCESS")
                .durationMs(0)
                .elapsedMs(0)
                .summary(Map.of(
                        "totalAfter", valid.size(),
                        "duplicatesRemoved", qas.size() - valid.size()
                ))
                .build());
        return valid.size();
    }

    // ==================== Store ====================

    private void storeQaPairs(String datasetId, List<Map<String, Object>> qas) {
        if (qas.isEmpty()) return;
        List<EvalQaPair> entities = new ArrayList<>();
        for (Map<String, Object> qa : qas) {
            EvalQaPair pair = EvalQaPair.builder()
                    .pairId("qa-" + UUID.randomUUID().toString().substring(0, 8))
                    .datasetId(datasetId)
                    .question((String) qa.get("question"))
                    .answer((String) qa.get("answer"))
                    .qaType((String) qa.getOrDefault("qaType", "FACTUAL"))
                    .sourceChunkIds(toArray(qa.get("sourceChunkIds")))
                    .sourceDocPath((String) qa.get("sourceDocPath"))
                    .difficulty((String) qa.getOrDefault("difficulty", "MEDIUM"))
                    .build();
            entities.add(pair);
        }
        datasetService.saveQaPairs(entities);
    }

    // ==================== HTML parsing ====================

    private String extractText(String html) {
        String text = HTML_TAG.matcher(html).replaceAll("\n");
        text = HTML_ENTITY.matcher(text).replaceAll(" ");
        text = text.replace("\r", "");
        text = MULTI_NEWLINE.matcher(text).replaceAll("\n\n");
        return Arrays.stream(text.split("\n"))
                .map(String::strip)
                .filter(line -> !line.isBlank())
                .collect(Collectors.joining("\n"));
    }

    // ==================== LLM ====================

    private LlmGatewayRequest buildQaGenerationRequest(String chunkText) {
        String systemPrompt = """
            你是一个专业的QA数据集生成助手。根据提供的知识片段，生成高质量的中文问答对。

            要求：
            1. 生成4种类型的问答对：事实型(FACTUAL)、对比型(COMPARISON)、多跳推理型(MULTI_HOP)、不可回答型(UNANSWERABLE)
            2. 事实型题目要精确可验证，答案直接来源于文本
            3. 对比型题目要求比较多个实体、数值、时间或规定
            4. 多跳推理型要求综合多个片段的信息进行推理
            5. 不可回答型是看起来与文本相关但实际无法从提供内容中回答的问题
            6. 难度标注：EASY=单chunk直接可得, MEDIUM=需跨段理解, HARD=需要综合推断

            严格按以下JSON数组格式输出，不要包含其他内容：
            [{"question": "...", "answer": "...", "qaType": "FACTUAL", "sourceChunkIds": ["chk-0"], "difficulty": "EASY"}]
            """;

        String userPrompt = "请根据以下知识片段生成" + evalProperties.getQaBatchSize() + "个问答对：\n\n" + chunkText;

        return LlmGatewayRequest.builder()
                .model(evalProperties.getGeneratorModel())
                .messages(List.of(
                        LlmGatewayRequest.Message.builder().role("system").content(systemPrompt).build(),
                        LlmGatewayRequest.Message.builder().role("user").content(userPrompt).build()
                ))
                .temperature(evalProperties.getGeneratorTemperature())
                .maxTokens(evalProperties.getGeneratorMaxTokens())
                .build();
    }

    private List<Map<String, Object>> parseQaResponse(String response, List<Map<String, Object>> chunks) {
        try {
            String json = response.strip();
            if (json.startsWith("```")) {
                json = json.replaceAll("```\\w*\\n?", "").replaceAll("```", "").strip();
            }
            // Try direct parse first
            try {
                return parseQaList(json, chunks);
            } catch (Exception ignored) {
                // LLM may produce malformed JSON — apply fixes below
            }
            // Fix 1: Chinese-context ASCII double-quotes inside string values
            json = sanitizeChineseQuotes(json);
            // Fix 2: Missing commas between objects }{
            json = json.replaceAll("\\}\\s*\\{", "},{");
            // Fix 3: Missing opening bracket
            if (!json.startsWith("[")) {
                int idx = json.indexOf('[');
                if (idx >= 0) json = json.substring(idx);
            }
            // Fix 4: Missing closing bracket (truncated response)
            int lastBrace = json.lastIndexOf('}');
            if (lastBrace >= 0) {
                String after = json.substring(lastBrace + 1).strip();
                if (!after.endsWith("]")) {
                    json = json.substring(0, lastBrace + 1) + "]";
                }
            }
            return parseQaList(json, chunks);
        } catch (Exception e) {
            log.warn("Failed to parse QA response ({} chars): {}", response.length(),
                    e.getMessage().length() > 200 ? e.getMessage().substring(0, 200) : e.getMessage());
            return List.of();
        }
    }

    /**
     * Escape ASCII double-quotes used as Chinese punctuation inside JSON string values.
     * LLMs often output 分别"面值"核算 where the inner quotes are ASCII U+0022, which
     * breaks JSON parsing. We detect internal quotes by their CJK context and escape them.
     */
    private String sanitizeChineseQuotes(String json) {
        StringBuilder sb = new StringBuilder(json.length() + 128);
        boolean inString = false;
        boolean escaped = false;

        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);

            if (escaped) {
                sb.append(c);
                escaped = false;
                continue;
            }
            if (c == '\\' && inString) {
                sb.append(c);
                escaped = true;
                continue;
            }
            if (c == '"') {
                if (!inString) {
                    inString = true;
                    sb.append(c);
                } else {
                    // Inside a JSON string value. Look ahead to see if this " is structural or Chinese.
                    int next = i + 1;
                    while (next < json.length() && (json.charAt(next) == ' ' || json.charAt(next) == '\t'
                            || json.charAt(next) == '\n' || json.charAt(next) == '\r')) {
                        next++;
                    }
                    boolean closesJsonString = false;
                    if (next < json.length()) {
                        char nextChar = json.charAt(next);
                        closesJsonString = (nextChar == ',' || nextChar == ':' || nextChar == '}' || nextChar == ']');
                    } else {
                        closesJsonString = true;
                    }
                    if (closesJsonString) {
                        inString = false;
                        sb.append(c);
                    } else {
                        // Internal double-quote used as Chinese punctuation — escape it
                        sb.append('\\').append(c);
                    }
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private List<Map<String, Object>> parseQaList(String json, List<Map<String, Object>> chunks) throws Exception {
        List<Map<String, Object>> qas = objectMapper.readValue(json, new TypeReference<>() {});
        if (!chunks.isEmpty()) {
            String srcPath = (String) chunks.get(0).get("sourceFile");
            for (Map<String, Object> qa : qas) {
                qa.putIfAbsent("sourceDocPath", srcPath);
            }
        }
        return qas;
    }

    // ==================== Helpers ====================

    @SuppressWarnings("unchecked")
    private <T> T runStage(String stageName, long pipelineStart, Consumer<StageEvent> onStage,
                           StageSupplier<T> supplier) throws Exception {
        long start = System.currentTimeMillis();
        try {
            T result = supplier.get();
            long durationMs = System.currentTimeMillis() - start;
            onStage.accept(StageEvent.builder()
                    .stage(stageName)
                    .status("SUCCESS")
                    .durationMs(durationMs)
                    .elapsedMs(System.currentTimeMillis() - pipelineStart)
                    .summary(Map.of("durationMs", durationMs))
                    .build());
            return result;
        } catch (Exception e) {
            long durationMs = System.currentTimeMillis() - start;
            onStage.accept(StageEvent.builder()
                    .stage(stageName)
                    .status("ERROR")
                    .durationMs(durationMs)
                    .elapsedMs(System.currentTimeMillis() - pipelineStart)
                    .summary(Map.of("error", e.getMessage()))
                    .build());
            throw e;
        }
    }

    private String[] toArray(Object obj) {
        if (obj instanceof List<?> list) {
            return list.stream().map(Object::toString).toArray(String[]::new);
        }
        return new String[0];
    }

    @FunctionalInterface
    private interface StageSupplier<T> {
        T get() throws Exception;
    }

    // Internal state holder — avoids massive intermediate collections
    private static class GenerationState {
        int fileCount = 0;
        int totalChunks = 0;
        int rawQaCount = 0;
        final List<Map<String, Object>> allQas = new ArrayList<>();
    }
}
