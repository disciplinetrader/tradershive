/**
 * TEMPORARY diagnostic — delete once cron auth is confirmed working.
 *
 * The problem it solves: `checkCronAuth` gives one bit of information. 503
 * means no secret is configured, 401 means one is configured and the caller's
 * value did not match. There is no way to tell "the server has a different
 * value than the Secrets panel shows" from "my job command has a typo", and
 * both produce an identical, permanent 401.
 *
 * This reports which environment variable the guard would actually use, how
 * long the loaded value is, and whether the value you send matches it. It
 * NEVER returns the secret. The only new information beyond what the real
 * endpoints already leak is the length and which variable is in play, which is
 * worth the trade for a bug that has survived three repair attempts.
 *
 * Deploying it also tests the publish pipeline: if this 404s after a publish,
 * publishing is what is broken, which is itself the answer.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { guardRoute } from "@/lib/server-errors";

function fingerprint(v: string): string {
  // 12 hex chars of SHA-256. Not reversible; enough to compare two values
  // without either side ever transmitting one.
  return createHash("sha256").update(v).digest("hex").slice(0, 12);
}

export const Route = createFileRoute("/api/public/hooks/cron-auth-debug")({
  server: {
    handlers: {
      POST: guardRoute("api/public/hooks/cron-auth-debug", async ({ request }) => {
        const cron = process.env.CRON_SECRET;
        const fallback = process.env.HISTORICAL_SYNC_CRON_SECRET;

        // Exactly the resolution order checkCronAuth uses.
        const active = cron ?? fallback ?? "";
        const activeSource = cron != null ? "CRON_SECRET" : fallback != null ? "HISTORICAL_SYNC_CRON_SECRET" : null;

        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        return new Response(
          JSON.stringify({
            // What the SERVER has loaded.
            cronSecretSet: cron != null,
            cronSecretLen: cron?.length ?? 0,
            cronSecretFingerprint: cron ? fingerprint(cron) : null,
            fallbackSet: fallback != null,
            fallbackLen: fallback?.length ?? 0,
            // Which one the guard would compare against.
            activeSource,
            activeLen: active.length,
            // What YOU sent, and whether it matches.
            providedLen: provided.length,
            providedFingerprint: provided ? fingerprint(provided) : null,
            matches: active !== "" && provided !== "" && active === provided,
            // Mirrors what the real endpoints would have answered.
            wouldReturn: active === "" ? 503 : active === provided ? 200 : 401,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    },
  },
});
