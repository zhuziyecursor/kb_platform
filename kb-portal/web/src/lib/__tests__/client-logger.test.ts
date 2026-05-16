import { describe, it, expect, vi, afterEach } from "vitest";
import { clientLogger } from "../client-logger";

describe("clientLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function captureOutput(fn: () => void): { log: string[]; warn: string[]; error: string[] } {
    const captured: { log: string[]; warn: string[]; error: string[] } = {
      log: [], warn: [], error: [],
    };
    vi.spyOn(console, "log").mockImplementation((...args) => {
      captured.log.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      captured.warn.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args) => {
      captured.error.push(args.map(String).join(" "));
    });
    fn();
    return captured;
  }

  function parseFirstJson(output: string[]): Record<string, unknown> | null {
    const line = output[0];
    if (!line) return null;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  describe("info", () => {
    it("emits valid JSON to console.log", () => {
      const out = captureOutput(() => clientLogger.info("test message"));
      const json = parseFirstJson(out.log);
      expect(json).not.toBeNull();
      expect(json!.msg).toBe("test message");
      expect(json!.level).toBe("INFO");
      expect(json!.service).toBe("kb-portal");
      expect(json!.event_type).toBe("app");
      expect(json!.ts).toEqual(expect.any(String));
    });

    it("includes extra fields in JSON", () => {
      const out = captureOutput(() =>
        clientLogger.info("done", { trace_id: "tr-abc", path: "/rag/chat" })
      );
      const json = parseFirstJson(out.log);
      expect(json!.trace_id).toBe("tr-abc");
      expect(json!.path).toBe("/rag/chat");
    });

    it("does not throw for circular references", () => {
      const circular: Record<string, unknown> = {};
      (circular as Record<string, unknown>).self = circular;
      expect(() => clientLogger.info("circular test", circular)).not.toThrow();
    });

    it("does not throw for undefined extra", () => {
      expect(() => clientLogger.info("msg", undefined)).not.toThrow();
    });
  });

  describe("warn", () => {
    it("emits valid JSON to console.warn", () => {
      const out = captureOutput(() => clientLogger.warn("warning message"));
      expect(out.warn.length).toBe(1);
      const json = parseFirstJson(out.warn);
      expect(json!.level).toBe("WARN");
    });
  });

  describe("error", () => {
    it("emits valid JSON to console.error", () => {
      const out = captureOutput(() => clientLogger.error("error message"));
      expect(out.error.length).toBe(1);
      const json = parseFirstJson(out.error);
      expect(json!.level).toBe("ERROR");
      expect(json!.event_type).toBe("error");
    });

    it("includes error_code and stack_trace", () => {
      const out = captureOutput(() =>
        clientLogger.error("fetch failed", {
          error_code: "API_TIMEOUT",
          stack_trace: "Error: timeout\\n  at fetch (/app/api.ts:10:5)",
        })
      );
      const json = parseFirstJson(out.error);
      expect(json!.error_code).toBe("API_TIMEOUT");
      expect(json!.stack_trace).toContain("timeout");
    });
  });

  describe("access", () => {
    it("emits with event_type=access", () => {
      const out = captureOutput(() =>
        clientLogger.access("GET /rag/v1/chat 200 245ms", {
          path: "/rag/v1/chat",
          status_code: 200,
          duration_ms: 245,
          trace_id: "tr-xyz",
        })
      );
      const json = parseFirstJson(out.log);
      expect(json!.event_type).toBe("access");
      expect(json!.status_code).toBe(200);
      expect(json!.duration_ms).toBe(245);
      expect(json!.trace_id).toBe("tr-xyz");
    });
  });

  describe("safety — never throws", () => {
    it("survives huge messages", () => {
      const huge = "x".repeat(100_000);
      expect(() => clientLogger.info(huge)).not.toThrow();
    });

    it("survives unicode and emoji", () => {
      expect(() => clientLogger.info("查询完成 ✅")).not.toThrow();
    });

    it("survives null prototype objects", () => {
      const obj = Object.create(null);
      (obj as Record<string, unknown>).key = "value";
      expect(() => clientLogger.info("null proto", obj as Record<string, unknown>)).not.toThrow();
    });

    it("survives Symbol values in extra", () => {
      // JSON.stringify throws on Symbol — the logger must survive this
      const extra = { sym: Symbol("test") as unknown as string };
      expect(() => clientLogger.info("symbol test", extra)).not.toThrow();
    });
  });
});
