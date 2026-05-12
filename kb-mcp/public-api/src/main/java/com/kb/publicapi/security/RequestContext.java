package com.kb.publicapi.security;

public final class RequestContext {

    private static final ThreadLocal<ApiKeyConfig> HOLDER = new ThreadLocal<>();

    private RequestContext() {
    }

    public static void set(ApiKeyConfig config) {
        HOLDER.set(config);
    }

    public static ApiKeyConfig get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
