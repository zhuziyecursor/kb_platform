type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntryBase {
  ts: string;
  level: LogLevel;
  service: "kb-portal";
  msg: string;
  event_type: "app" | "error" | "access";
  trace_id?: string;
  path?: string;
  duration_ms?: number;
  status_code?: number;
  error_code?: string;
  stack_trace?: string;
}

function emit(entry: LogEntryBase): void {
  try {
    const line = JSON.stringify(entry);
    if (entry.level === "ERROR") {
      console.error(line);
    } else if (entry.level === "WARN") {
      console.warn(line);
    } else {
      console.log(line);
    }
  } catch {
    // JSON stringify failed — silently skip, don't break the app
  }
}

function nowISO(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

export const clientLogger = {
  info(msg: string, extra?: Partial<LogEntryBase>) {
    emit({
      ts: nowISO(), level: "INFO", service: "kb-portal", msg,
      event_type: "app", ...extra,
    });
  },
  warn(msg: string, extra?: Partial<LogEntryBase>) {
    emit({
      ts: nowISO(), level: "WARN", service: "kb-portal", msg,
      event_type: "app", ...extra,
    });
  },
  error(msg: string, extra?: Partial<LogEntryBase>) {
    emit({
      ts: nowISO(), level: "ERROR", service: "kb-portal", msg,
      event_type: "error", ...extra,
    });
  },
  access(msg: string, extra?: Partial<LogEntryBase>) {
    emit({
      ts: nowISO(), level: "INFO", service: "kb-portal", msg,
      event_type: "access", ...extra,
    });
  },
};
