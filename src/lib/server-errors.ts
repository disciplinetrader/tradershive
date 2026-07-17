/**
 * Shared server-side error handling utilities.
 *
 * Goals:
 *  - Never leak stack traces, DB constraint text, or provider internals to the client.
 *  - Always log the *raw* error server-side so it shows up in worker logs.
 *  - Give server-route handlers a small `guardRoute()` wrapper that turns any
 *    thrown error into a well-formed JSON Response with a stable shape.
 *  - Give server functions a middleware (`errorGuardMiddleware`) that sanitizes
 *    thrown errors before TanStack serializes them back over RPC.
 */
import { createMiddleware } from "@tanstack/react-start";
import { ZodError } from "zod";

export type ClientErrorShape = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;
  constructor(opts: {
    code: string;
    message: string;
    status?: number;
    details?: unknown;
    /** Set to true to expose message verbatim to the client. Default true for AppError. */
    expose?: boolean;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "AppError";
    this.code = opts.code;
    this.status = opts.status ?? 400;
    this.details = opts.details;
    this.expose = opts.expose ?? true;
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export const Errors = {
  unauthorized: (msg = "You must be signed in to do that.") =>
    new AppError({ code: "unauthorized", message: msg, status: 401 }),
  forbidden: (msg = "You don't have permission to do that.") =>
    new AppError({ code: "forbidden", message: msg, status: 403 }),
  notFound: (msg = "Not found.") =>
    new AppError({ code: "not_found", message: msg, status: 404 }),
  badRequest: (msg = "Invalid request.", details?: unknown) =>
    new AppError({ code: "bad_request", message: msg, status: 400, details }),
  rateLimited: (msg = "Too many requests. Please slow down.") =>
    new AppError({ code: "rate_limited", message: msg, status: 429 }),
  conflict: (msg = "That conflicts with existing data.") =>
    new AppError({ code: "conflict", message: msg, status: 409 }),
  upstream: (msg = "Upstream service unavailable.", cause?: unknown) =>
    new AppError({ code: "upstream_unavailable", message: msg, status: 502, cause }),
  internal: (msg = "Something went wrong. Please try again.") =>
    new AppError({ code: "internal", message: msg, status: 500, expose: false }),
};

/** Map any thrown value to a safe { status, body } pair. Always logs the raw error. */
export function toClientError(err: unknown, ctx?: string): {
  status: number;
  body: ClientErrorShape;
} {
  // Zod validation
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path?.join(".") || "input";
    return {
      status: 400,
      body: {
        ok: false,
        code: "validation_error",
        message: first ? `${path}: ${first.message}` : "Invalid input.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  }

  // Our tagged application errors
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        ok: false,
        code: err.code,
        message: err.expose ? err.message : "Something went wrong. Please try again.",
        details: err.details,
      },
    };
  }

  // Supabase / PostgREST style
  const anyErr = err as { code?: string; message?: string; hint?: string; status?: number } | null;
  if (anyErr && typeof anyErr === "object" && ("code" in anyErr || "hint" in anyErr) && "message" in anyErr) {
    console.error(`[server-error]${ctx ? ` [${ctx}]` : ""} supabase`, anyErr);
    const code = String(anyErr.code ?? "");
    // Common cases we can safely surface
    if (code === "23505") {
      return {
        status: 409,
        body: { ok: false, code: "conflict", message: "That already exists." },
      };
    }
    if (code === "23503") {
      return {
        status: 409,
        body: { ok: false, code: "conflict", message: "Related record is missing." },
      };
    }
    if (code === "42501" || code === "PGRST301") {
      return {
        status: 403,
        body: { ok: false, code: "forbidden", message: "You don't have permission to do that." },
      };
    }
    return {
      status: anyErr.status && Number.isFinite(anyErr.status) ? Number(anyErr.status) : 500,
      body: {
        ok: false,
        code: "database_error",
        message: "Could not complete the request. Please try again.",
      },
    };
  }

  // Unknown — never leak the message
  console.error(`[server-error]${ctx ? ` [${ctx}]` : ""}`, err);
  return {
    status: 500,
    body: { ok: false, code: "internal", message: "Something went wrong. Please try again." },
  };
}

type RouteHandler<Params = unknown> = (args: {
  request: Request;
  params: Params;
  context: unknown;
}) => Promise<Response> | Response;

/**
 * Wrap a server-route handler so any thrown error becomes a sanitized JSON
 * response with the shape `{ ok: false, code, message }`.
 */
export function guardRoute<Params = unknown>(
  name: string,
  handler: RouteHandler<Params>,
): RouteHandler<Params> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const { status, body } = toClientError(err, name);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  };
}

/**
 * Server-function middleware that catches any throw from a downstream handler,
 * logs the raw error, and rethrows a client-safe `AppError` so the message that
 * arrives on the client is always sanitized.
 *
 * Register once in `src/start.ts` under `functionMiddleware`. Existing per-fn
 * `.middleware([...])` chains keep working — this runs around all of them.
 */
export const errorGuardMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    // Preserve Response throws (used by TanStack redirect/notFound / auth 401s).
    if (err instanceof Response) throw err;
    const { body } = toClientError(err, "server-fn");
    // Rethrow as a plain Error whose message is the sanitized JSON so both
    // legacy string consumers and JSON.parse consumers work.
    const safe = new Error(body.message);
    (safe as Error & { code?: string; details?: unknown }).code = body.code;
    (safe as Error & { code?: string; details?: unknown }).details = body.details;
    throw safe;
  }
});
