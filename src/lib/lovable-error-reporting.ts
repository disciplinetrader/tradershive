type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward to lovable.js's reporting hook,
  // which is present only inside the editor preview.
  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  window.__lovableReportRuntimeError?.({
    message,
    stack: error instanceof Error ? error.stack : undefined,
    filename: window.location.pathname,
  });
}

/**
 * Install browser-side listeners that forward uncaught errors and unhandled
 * promise rejections into Lovable telemetry. Idempotent — safe to call more
 * than once. No-op on the server.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __lovableGlobalHandlersInstalled?: boolean };
  if (w.__lovableGlobalHandlersInstalled) return;
  w.__lovableGlobalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    const err = event.error ?? new Error(event.message || "Uncaught error");
    reportLovableError(err, { mechanism: "onerror", filename: event.filename });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportLovableError(event.reason, { mechanism: "unhandledrejection" });
  });
}
