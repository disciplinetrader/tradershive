/**
 * Shared authentication guard for cron / scheduled-job endpoints under
 * `/api/public/*`.
 *
 * Those routes bypass site auth on published deployments, so every handler
 * must prove the caller knows a shared secret before touching service-role
 * database access.
 *
 * Fails closed: when no secret is configured the endpoint returns 503 rather
 * than running unauthenticated.
 */
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Returns a `Response` to short-circuit with when the request is not an
 * authorised cron call, or `null` when the caller is authorised.
 */
export function checkCronAuth(request: Request): Response | null {
  const expected =
    process.env.CRON_SECRET ?? process.env.HISTORICAL_SYNC_CRON_SECRET ?? "";
  if (!expected) return new Response("Not configured", { status: 503 });

  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!provided || !safeEqual(provided, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
