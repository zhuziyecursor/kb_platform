package com.kb.rag.config;

import com.kb.rag.util.TraceLogHelper;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

/**
 * 请求日志 Filter: 自动注入 trace_id, 记录 access log.
 * 设计为最低优先级, 确保不干扰 Spring Security 等其他 Filter.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 10)
public class TraceLogFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(TraceLogFilter.class);

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) request;
        HttpServletResponse httpResp = (HttpServletResponse) response;

        boolean mdcSet = false;
        long start = System.currentTimeMillis();

        try {
            // 优先从请求头获取上游 trace_id, 否则生成新的
            String traceId = httpReq.getHeader("X-Trace-Id");
            if (traceId == null || traceId.isBlank()) {
                traceId = "tr-" + UUID.randomUUID();
            }

            TraceLogHelper.setTraceId(traceId);
            TraceLogHelper.setEventType("access");
            mdcSet = true;

            // 响应头返回 trace_id, 方便前端提取
            try {
                httpResp.setHeader("X-Trace-Id", traceId);
            } catch (Exception ignored) {
                // 响应头设置失败不影响请求处理
            }

        } catch (Exception e) {
            log.warn("TraceLogFilter: failed to set MDC context", e);
        }

        try {
            chain.doFilter(request, response);
        } finally {
            try {
                long duration = System.currentTimeMillis() - start;
                int status = httpResp.getStatus();

                if (mdcSet) {
                    TraceLogHelper.put("duration_ms", String.valueOf(duration));
                    TraceLogHelper.put("method", httpReq.getMethod());
                    TraceLogHelper.put("path", httpReq.getRequestURI());
                    TraceLogHelper.put("status_code", String.valueOf(status));

                    String msg = String.format("HTTP %d %s %s %dms",
                            status, httpReq.getMethod(), httpReq.getRequestURI(), duration);

                    if (status >= 500) {
                        log.error(msg);
                    } else if (status >= 400) {
                        log.warn(msg);
                    } else {
                        log.info(msg);
                    }
                }
            } catch (Exception e) {
                log.warn("TraceLogFilter: failed to log access entry", e);
            } finally {
                TraceLogHelper.clear();
            }
        }
    }
}
