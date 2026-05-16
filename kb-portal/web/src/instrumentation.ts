/**
 * Next.js instrumentation hook — SSR-side global error logging.
 * Errors here are captured by the Node.js process and collected by Promtail.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { clientLogger } = await import("./lib/client-logger");

    process.on("uncaughtException", (err) => {
      clientLogger.error(`Uncaught exception: ${err.message}`, {
        error_code: "UNCAUGHT_EXCEPTION",
        stack_trace: err.stack?.replace(/\n/g, "\\n"),
      });
    });

    process.on("unhandledRejection", (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      clientLogger.error(`Unhandled rejection: ${message}`, {
        error_code: "UNHANDLED_REJECTION",
      });
    });
  } catch {
    // Silently skip if logging setup fails — never break the app startup
  }
}
