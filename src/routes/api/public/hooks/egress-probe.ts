/**
 * Egress reachability probe — what can THIS deployment actually reach?
 *
 * WHY THIS EXISTS AS AN ENDPOINT AND NOT A SCRIPT
 *
 * CX-1 is a block on the ORIGIN IP: Binance answers 403 with an HTML body to
 * this deployment's egress while the identical request from a developer machine
 * returns 200 with real klines. Every local probe therefore proves nothing, and
 * the audit doc has said so since 2026-08-21 — yet the question kept being
 * re-asked, because there was nowhere to ask it from. This is that place.
 *
 * The same confusion has a second source worth recording here: crypto quotes
 * DO work live in the app, which looks like evidence the block is gone. It is
 * not. `providers/binance.ts` disables itself when `typeof window ===
 * "undefined"`, so live crypto runs in the user's BROWSER on a residential IP
 * and never touches this worker's egress. Same host, same `/api/v3/klines`
 * path, different origin. Only this endpoint speaks for the deployment.
 *
 * WHY THE TARGETS ARE HARDCODED
 *
 * A cron-authed endpoint that fetches a caller-supplied URL is an SSRF hole
 * pointed at the deployment's own network position. The allowlist below is the
 * whole feature: three fixed, public, unauthenticated market-data GETs with no
 * credentials attached and no writes anywhere. Adding a target means editing
 * this file, which is the intended cost.
 *
 * WHAT EACH TARGET ANSWERS
 *
 *   binance.vision   Binance's market-data-only domain. A different hostname
 *                    and edge from the trading API, serving the IDENTICAL
 *                    symbol and data — verified 2026-08-28, close 65036.30 for
 *                    2026-07-15T00:00Z from both. If this is reachable and
 *                    api.binance.com is not, the fix is one constant
 *                    (`BINANCE_REST`, historical/providers.server.ts) with no
 *                    routing change, no symbol mapping and no basis question.
 *   bybit            A different company. Separates "Binance blocks us" from
 *                    "exchanges block cloud IPs generally". Also serves
 *                    BTCUSDT, so it carries no basis difference either.
 *   api.binance.com  CX-1 itself, re-measured. Last measured 2026-08-19.
 *
 * Deliberately NOT recorded to the database. This is a diagnostic read, and a
 * writer here would need service-role credentials for no reason — the response
 * body is the artifact, and `net._http_response` retains it when pg_cron is the
 * caller.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardRoute } from "@/lib/server-errors";
import { checkCronAuth } from "@/lib/cron-guard";

/** A fixed window with known-good data on every venue, so an empty result means refusal rather than "no trades then". */
const FROM = Date.UTC(2026, 6, 15, 0, 0, 0);
const TO = Date.UTC(2026, 6, 15, 1, 0, 0);

const TARGETS: { name: string; url: string }[] = [
  {
    name: "data-api.binance.vision",
    url: `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${FROM}&endTime=${TO}&limit=1000`,
  },
  {
    name: "api.bybit.com",
    url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=1&start=${FROM}&end=${TO}&limit=1000`,
  },
  {
    name: "api.binance.com",
    url: `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${FROM}&endTime=${TO}&limit=1000`,
  },
];

/** Enough to tell JSON klines from an HTML block page, short enough not to dump a document into a log. */
const BODY_PREFIX_CHARS = 300;

/** Nothing here should take long; a hang is itself an answer and must not hold the request open. */
const TIMEOUT_MS = 10_000;

type ProbeResult = {
  host: string;
  url: string;
  status: number | null;
  ms: number;
  contentType: string | null;
  /** Bars parsed, when the body is the JSON we expected. `null` when it is not. */
  bars: number | null;
  bodyPrefix: string;
  error: string | null;
};

async function probe(name: string, url: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let bars: number | null = null;
    try {
      const j = JSON.parse(text);
      // Binance returns a bare array; Bybit nests under result.list.
      if (Array.isArray(j)) bars = j.length;
      else if (Array.isArray(j?.result?.list)) bars = j.result.list.length;
    } catch {
      // Not JSON. That IS the finding — CX-1's signature is an HTML body.
    }
    return {
      host: name,
      url,
      status: res.status,
      ms: Date.now() - started,
      contentType: res.headers.get("content-type"),
      bars,
      bodyPrefix: text.slice(0, BODY_PREFIX_CHARS),
      error: null,
    };
  } catch (e) {
    return {
      host: name,
      url,
      status: null,
      ms: Date.now() - started,
      contentType: null,
      bars: null,
      bodyPrefix: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const Route = createFileRoute("/api/public/hooks/egress-probe")({
  server: {
    handlers: {
      GET: guardRoute("api/public/hooks/egress-probe", async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;

        // Serial, not parallel. Three requests is nothing, and running them one
        // at a time keeps a slow or hanging target from being misread as a
        // problem with whichever target shared its window.
        const results: ProbeResult[] = [];
        for (const t of TARGETS) results.push(await probe(t.name, t.url));

        const body = {
          probedAt: new Date().toISOString(),
          window: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString() },
          note: "Reachability from the DEPLOYMENT's egress. A local run of the same URLs answers a different question.",
          results,
        };
        // 200 whatever the targets said: the probe succeeded in probing. A
        // non-200 here would mean this endpoint failed, which is a different
        // fact from a target refusing us, and conflating them is how a
        // reachability check starts lying.
        return new Response(JSON.stringify(body, null, 2), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }),
    },
  },
});
