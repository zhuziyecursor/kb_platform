package com.kb.rag.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@Configuration
public class ChannelExecutorConfig {

    @Bean("channelPool")
    public ExecutorService channelPool() {
        int cores = Runtime.getRuntime().availableProcessors();
        int corePoolSize = cores * 2;
        int maxPoolSize = corePoolSize * 4;
        return new ThreadPoolExecutor(
                corePoolSize,
                maxPoolSize,
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(),
                r -> {
                    Thread t = new Thread(r, "channel-" + System.currentTimeMillis() % 10000);
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.CallerRunsPolicy());
    }
}
