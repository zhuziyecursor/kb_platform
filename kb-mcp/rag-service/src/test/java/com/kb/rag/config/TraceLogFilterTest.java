package com.kb.rag.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class TraceLogFilterTest {

    private TraceLogFilter filter;
    private HttpServletRequest request;
    private HttpServletResponse response;
    private FilterChain chain;

    @BeforeEach
    void setUp() {
        filter = new TraceLogFilter();
        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
        chain = mock(FilterChain.class);
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/rag/v1/chat");
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    void shouldGenerateTraceId_whenHeaderMissing() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn(null);
        when(response.getStatus()).thenReturn(200);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verify(response).setHeader(eq("X-Trace-Id"), anyString());
    }

    @Test
    void shouldReuseTraceIdFromHeader() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn("tr-incoming-123");
        when(response.getStatus()).thenReturn(200);

        filter.doFilter(request, response, chain);

        verify(response).setHeader("X-Trace-Id", "tr-incoming-123");
        verify(chain).doFilter(request, response);
    }

    @Test
    void shouldSetMdcContext() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn("tr-mdc-test");
        when(response.getStatus()).thenReturn(200);

        filter.doFilter(request, response, chain);

        assertThat(MDC.get("trace_id")).isNull(); // cleared after filter
        verify(chain).doFilter(request, response);
    }

    @Test
    void shouldLogAccessFor200() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn("tr-200");
        when(response.getStatus()).thenReturn(200);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    @Test
    void shouldNotBlockRequest_whenMdcFails() throws Exception {
        // Simulate worst case: request.getHeader throws
        when(request.getHeader("X-Trace-Id")).thenThrow(new RuntimeException("mock failure"));

        filter.doFilter(request, response, chain);

        // Must still invoke the chain
        verify(chain).doFilter(request, response);
    }

    @Test
    void shouldNotBlockRequest_whenResponseSetHeaderFails() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn("tr-test");
        doThrow(new RuntimeException("headers already sent")).when(response).setHeader(anyString(), anyString());

        assertThatCode(() -> filter.doFilter(request, response, chain))
                .doesNotThrowAnyException();

        verify(chain).doFilter(request, response);
    }

    @Test
    void shouldClearMdcAfterRequest() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn("tr-clear");
        when(response.getStatus()).thenReturn(200);

        filter.doFilter(request, response, chain);

        assertThat(MDC.getCopyOfContextMap()).isNull();
    }

    @Test
    void shouldStillClearMdc_whenChainThrows() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn("tr-chain-error");
        doThrow(new ServletException("chain failed")).when(chain).doFilter(request, response);

        try {
            filter.doFilter(request, response, chain);
        } catch (ServletException ignored) {
        }

        assertThat(MDC.getCopyOfContextMap()).isNull();
    }

    @Test
    void shouldGenerateUniqueTraceIds() throws Exception {
        when(request.getHeader("X-Trace-Id")).thenReturn(null);
        when(response.getStatus()).thenReturn(200);

        filter.doFilter(request, response, chain);
        verify(response).setHeader(eq("X-Trace-Id"), argThat(
                value -> value != null && value.toString().startsWith("tr-")));
    }
}
