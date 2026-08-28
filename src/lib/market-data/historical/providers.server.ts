/**
 * Historical Data Providers (server-only).
 *
 * Each provider fetches raw OHLCV from an external source and returns
 * normalized HistoricalCandle[] in UTC. Fully server-side to avoid
 * exposing endpoints to the browser and to enable node-fetch use.
 */

import type { HistoricalCandle, HistoricalTimeframe } from "./types";
import { HISTORICAL_TF_SECONDS } from "./types";
import { isEmptyWindowError, type ProviderErrorBody } from "./provider-errors";

/**
 * What a fetch returned, and whether the provider VOUCHED for an empty window.
 *
 * A bare `HistoricalCandle[]` cannot answer the only question the caller has
 * when it is empty: is this "the market was shut" or "we asked for the wrong
 * thing"? `isEmptyWindowError` already settles that here, at the boundary —
 * it just had nowhere to put the answer, so `runImport` re-derived "0 candles
 * means something is broken" and burned three retries on every weekend.
 *
 * `confirmedEmpty` is that answer, and NOTHING else. It is set only where the
 * provider explicitly said "your range was fine, there is nothing in it".
 * Absence is the safe default: a provider that never sets it keeps the old
 * behaviour, and the caller keeps throwing.
 */
export interface FetchCandlesResult {
  candles: HistoricalCandle[];
  /**
   * True when the provider returned its own "no data on the specified dates"
   * verdict for this window. Only meaningful when `candles` is empty — a
   * multi-page walk can confirm the window's far end after earlier pages
   * returned real bars, and that is a complete result, not an empty one.
   */
  confirmedEmpty?: boolean;
}

export interface HistoricalDataProvider {
  readonly code: string;
  readonly label: string;
  readonly supports: HistoricalTimeframe[];
  fetchCandles(opts: {
    nativeSymbol: string;
    timeframe: HistoricalTimeframe;
    from: number; // epoch ms
    to: number;   // epoch ms
  }): Promise<FetchCandlesResult>;
  earliest(nativeSymbol: string): Promise<number | null>;
}

/* ------------------------------ Binance ------------------------------ */

const BINANCE_REST = "https://api.binance.com";

const BINANCE_TF: Partial<Record<HistoricalTimeframe, string>> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w", "1M": "1M",
};

export class BinanceHistoricalProvider implements HistoricalDataProvider {
  readonly code = "binance";
  readonly label = "Binance";
  readonly supports: HistoricalTimeframe[] = ["1m","5m","15m","30m","1H","4H","1D","1W","1M"];

  async fetchCandles({ nativeSymbol, timeframe, from, to }: {
    nativeSymbol: string; timeframe: HistoricalTimeframe; from: number; to: number;
  }): Promise<FetchCandlesResult> {
    const interval = BINANCE_TF[timeframe];
    if (!interval) throw new Error(`Binance: unsupported timeframe ${timeframe}`);
    const stepMs = HISTORICAL_TF_SECONDS[timeframe] * 1000;
    const out: HistoricalCandle[] = [];
    let cursor = from;
    // Binance max limit 1000 per call.
    while (cursor < to) {
      const url = new URL(`${BINANCE_REST}/api/v3/klines`);
      url.searchParams.set("symbol", nativeSymbol.toUpperCase());
      url.searchParams.set("interval", interval);
      url.searchParams.set("startTime", String(cursor));
      url.searchParams.set("endTime", String(to));
      url.searchParams.set("limit", "1000");
      const res = await fetch(url.toString());
      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        throw new Error(`Binance HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const rows = (await res.json()) as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const r of rows) {
        const a = r as [number, string, string, string, string, string];
        const ts = Number(a[0]);
        const o = Number(a[1]);
        const h = Number(a[2]);
        const l = Number(a[3]);
        const c = Number(a[4]);
        const v = Number(a[5]);
        if (!Number.isFinite(o + h + l + c)) continue;
        out.push({ ts, open: o, high: h, low: l, close: c, volume: v });
      }
      const last = out[out.length - 1];
      if (!last) break;
      const next = last.ts + stepMs;
      if (next <= cursor) break;
      cursor = next;
      if (rows.length < 1000) break;
      // Gentle throttle to respect weight limits.
      await new Promise((r) => setTimeout(r, 120));
    }
    // No `confirmedEmpty`: Binance reports an empty window as an empty array,
    // which is indistinguishable from a bad symbol here. Unchanged behaviour.
    return { candles: out };
  }

  async earliest(nativeSymbol: string): Promise<number | null> {
    // Binance klines with startTime=0 returns the first available candle.
    const url = new URL(`${BINANCE_REST}/api/v3/klines`);
    url.searchParams.set("symbol", nativeSymbol.toUpperCase());
    url.searchParams.set("interval", "1M");
    url.searchParams.set("startTime", "0");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const rows = (await res.json()) as [number, ...unknown[]][];
    return rows?.[0]?.[0] ?? null;
  }
}

/* ------------------------------ Bybit ------------------------------
 *
 * Crypto history, replacing Binance because Binance cannot be reached from
 * this deployment (CX-1: 403 with an HTML body to the worker's egress, on both
 * `api.binance.com` AND `data-api.binance.vision`, confirmed 2026-08-28 by
 * `/api/public/hooks/egress-probe`). Bybit answered the same probe 200 with 61
 * real 1m klines in 85ms, so the block is Binance-specific rather than a
 * generic cloud-IP restriction.
 *
 * It is also the closer instrument, not merely the reachable one: Bybit lists
 * the SAME `BTCUSDT`-style spot pairs the journal's trades are recorded
 * against, so nothing here substitutes a USD spot price for a USDT pair.
 *
 * TWO WAYS THIS DIFFERS FROM THE BINANCE CLIENT ABOVE, BOTH LOAD-BEARING:
 *
 * 1. Bybit returns candles NEWEST-FIRST. Binance returns them oldest-first,
 *    and its loop advances a cursor off the last bar it received. Copying that
 *    shape here walks the wrong way and terminates after one page — so this
 *    pages BACKWARDS from `end`, and sorts ascending once at the end.
 *
 * 2. Bybit distinguishes an empty window from a bad request, and Binance
 *    cannot. `retCode: 0` with `list: []` is an explicit "your range was fine,
 *    there is nothing in it", while an unknown symbol is `retCode: 10001`.
 *    That is exactly the `confirmedEmpty` contract, so crypto gets the
 *    HD-4 protection forex already has rather than inheriting Binance's
 *    ambiguity.
 */

const BYBIT_REST = "https://api.bybit.com";

const BYBIT_TF: Partial<Record<HistoricalTimeframe, string>> = {
  "1m": "1", "5m": "5", "15m": "15", "30m": "30",
  "1H": "60", "4H": "240", "1D": "D", "1W": "W", "1M": "M",
};

/** Bybit's hard cap per kline request. */
const BYBIT_PAGE = 1000;

/** `retCode` for a well-formed request that matched no instrument. */
const BYBIT_UNKNOWN_SYMBOL = 10001;

/**
 * Edge headers worth keeping when a request fails.
 *
 * Bybit sits behind CloudFront, and CloudFront answers a GEOGRAPHIC block and a
 * rate/WAF block with the same status and a similar HTML body. `x-amz-cf-pop`
 * names the edge that served it and `x-amz-cf-id` identifies the exact request
 * to AWS — without them a 403 cannot be attributed, which is precisely the wall
 * the 2026-08-28 investigation hit.
 */
const CDN_DIAG_HEADERS = ["x-amz-cf-pop", "x-amz-cf-id", "via", "x-cache", "retry-after"] as const;

function captureCdnHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of CDN_DIAG_HEADERS) {
    const v = res.headers.get(h);
    if (v) out[h] = v;
  }
  return out;
}

export class BybitHistoricalProvider implements HistoricalDataProvider {
  readonly code = "bybit";
  readonly label = "Bybit";
  readonly supports: HistoricalTimeframe[] = ["1m","5m","15m","30m","1H","4H","1D","1W","1M"];

  async fetchCandles({ nativeSymbol, timeframe, from, to }: {
    nativeSymbol: string; timeframe: HistoricalTimeframe; from: number; to: number;
  }): Promise<FetchCandlesResult> {
    const interval = BYBIT_TF[timeframe];
    if (!interval) throw new Error(`Bybit: unsupported timeframe ${timeframe}`);
    const stepMs = HISTORICAL_TF_SECONDS[timeframe] * 1000;

    const out: HistoricalCandle[] = [];
    const seen = new Set<number>();
    // Walk BACKWARDS: `cursor` is the inclusive upper edge of the next page.
    let cursor = to;
    let confirmedEmpty = false;
    let pages = 0;

    /**
     * Page budget DERIVED from the work, never a fixed number.
     *
     * This was a hardcoded 60, copied from the shape of the Binance client
     * without checking it against the range a backfill actually asks for. 60
     * pages at 1m is 60,000 bars — 41.67 days. A 90-day import therefore
     * stopped dead at 41.67 days, returned the bars it had, and reported
     * SUCCESS. Measured 2026-08-28 on BTC/USDT: exactly 60,000 rows, first bar
     * 2026-07-17T13:36, against a request that began 2026-05-30.
     *
     * Any fixed number reintroduces that the moment some range exceeds it, so
     * the budget now scales with the span being fetched. The `+ 5` absorbs
     * partial pages, gaps and a boundary that does not align to a page.
     */
    const maxPages = Math.ceil((to - from) / (stepMs * BYBIT_PAGE)) + 5;

    /** Why the walk stopped. `null` means it ran the cursor past `from`. */
    let exit: "short-page" | "confirmed-empty" | null = null;

    while (cursor >= from) {
      /**
       * A truncated range is NOT a result. PAT-1.
       *
       * Returning `out` here would hand the caller a short series that is
       * indistinguishable from a complete one — no error, no status, nothing
       * to read — and `upsertCandles` would commit it, `latest_imported` would
       * advance, and the gap would look like data the venue does not have.
       * That is precisely how the 60-page cap hid for a full import cycle.
       * The budget is generous and derived; exhausting it means something is
       * wrong, and wrong must be loud.
       */
      if (pages >= maxPages) {
        throw new Error(
          `Bybit: page budget of ${maxPages} exhausted for ${nativeSymbol} ${timeframe} ` +
          `after ${out.length} bars; cursor still at ${new Date(cursor).toISOString()} ` +
          `with ${new Date(from).toISOString()} requested. Partial range withheld.`,
        );
      }
      pages++;
      const url = new URL(`${BYBIT_REST}/v5/market/kline`);
      url.searchParams.set("category", "spot");
      url.searchParams.set("symbol", nativeSymbol.toUpperCase());
      url.searchParams.set("interval", interval);
      url.searchParams.set("start", String(from));
      url.searchParams.set("end", String(cursor));
      url.searchParams.set("limit", String(BYBIT_PAGE));

      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        const cdn = captureCdnHeaders(res);
        // Typed, so the retry policy in `pipeline.server.ts` can read the
        // STATUS. It previously threw a plain `Error`, which made
        // `e instanceof HistoricalProviderError && httpStatus === 429` never
        // for this provider — so a 403 was retried three times against a block
        // that cannot clear in seven seconds.
        throw new HistoricalProviderError(
          "bybit",
          `HTTP ${res.status} on /v5/market/kline` +
            (Object.keys(cdn).length
              ? ` [${Object.entries(cdn).map(([k, v]) => `${k}=${v}`).join(" ")}]`
              : " [no CDN headers present]"),
          {
            httpStatus: res.status,
            responseType: res.headers.get("content-type") ?? undefined,
            symbol: nativeSymbol,
            timeframe,
            body,
            headers: cdn,
          },
        );
      }
      const json = (await res.json()) as {
        retCode?: number; retMsg?: string; result?: { list?: string[][] };
      };

      if (json?.retCode === BYBIT_UNKNOWN_SYMBOL) {
        // NOT an empty window. A symbol Bybit does not list can never fill,
        // and calling it empty would leave the row eligible for ever.
        throw new Error(`Bybit: unknown symbol ${nativeSymbol} (retCode 10001)`);
      }
      if (json?.retCode !== 0) {
        throw new Error(`Bybit retCode ${json?.retCode}: ${String(json?.retMsg ?? "unknown error")}`);
      }

      const list = json.result?.list ?? [];
      if (list.length === 0) {
        // `retCode: 0` with no rows is Bybit VOUCHING for the window. Only
        // meaningful when nothing was collected at all — a backward walk
        // reaching past the listing date after real pages is a complete
        // result, not an empty one.
        confirmedEmpty = out.length === 0;
        exit = "confirmed-empty";
        break;
      }

      // Newest-first. `[startMs, open, high, low, close, volume, turnover]`.
      let oldest = Number.POSITIVE_INFINITY;
      for (const row of list) {
        const ts = Number(row[0]);
        if (!Number.isFinite(ts) || ts < from || ts > to) continue;
        if (ts < oldest) oldest = ts;
        if (seen.has(ts)) continue;
        const o = Number(row[1]), h = Number(row[2]), l = Number(row[3]), c = Number(row[4]);
        if (!Number.isFinite(o + h + l + c)) continue;
        seen.add(ts);
        out.push({ ts, open: o, high: h, low: l, close: c, volume: Number(row[5] ?? 0) });
      }

      // A short page means the venue has nothing older in range. Complete.
      if (list.length < BYBIT_PAGE) { exit = "short-page"; break; }

      // Everything below is anomalous rather than terminal. A full page that
      // yields no in-window bar, or one that fails to move the cursor
      // backwards, cannot be distinguished from a complete result by the
      // caller — so it throws for the same reason the budget does.
      if (!Number.isFinite(oldest)) {
        throw new Error(
          `Bybit: full page with no bar inside the window for ${nativeSymbol} ${timeframe} ` +
          `at ${new Date(cursor).toISOString()}. Partial range withheld.`,
        );
      }
      const next = oldest - stepMs;
      if (next >= cursor) {
        throw new Error(
          `Bybit: cursor failed to advance for ${nativeSymbol} ${timeframe} ` +
          `at ${new Date(cursor).toISOString()}. Partial range withheld.`,
        );
      }
      cursor = next;
    }

    out.sort((a, b) => a.ts - b.ts);
    // Attributable in worker logs: a legitimately short series can be told
    // apart from a suspicious one without re-running anything.
    console.info(
      `[bybit] ${nativeSymbol} ${timeframe} ${out.length} bars in ${pages}/${maxPages} pages, ` +
      `stopped: ${exit ?? "reached-from"}`,
    );
    return { candles: out, confirmedEmpty };
  }

  async earliest(nativeSymbol: string): Promise<number | null> {
    // `limit=1` returns the NEWEST bar here, not the oldest — the opposite of
    // Binance. Monthly candles instead: 1000 of them span ~83 years, so one
    // request holds the whole listing and its last element is the first bar.
    const url = new URL(`${BYBIT_REST}/v5/market/kline`);
    url.searchParams.set("category", "spot");
    url.searchParams.set("symbol", nativeSymbol.toUpperCase());
    url.searchParams.set("interval", "M");
    url.searchParams.set("limit", String(BYBIT_PAGE));
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = (await res.json()) as { retCode?: number; result?: { list?: string[][] } };
    if (json?.retCode !== 0) return null;
    const list = json.result?.list ?? [];
    if (!list.length) return null;
    const ts = Number(list[list.length - 1][0]);
    return Number.isFinite(ts) ? ts : null;
  }
}

/* ------------------------------ Stooq ------------------------------
 *
 * Free, no-key daily OHLC feed for FX / metals / indices / commodities.
 * Daily resolution only — intraday for these symbols must come from a
 * different provider (Twelve Data today).
 *
 * NOTE: this provider was historically mis-registered under the code
 * "dukascopy". No Dukascopy code has ever run. `LEGACY_PROVIDER_CODES`
 * keeps old rows resolvable while the DB is migrated to "stooq".
 */

const STOOQ_BASE = "https://stooq.com/q/d/l/";

export class StooqHistoricalProvider implements HistoricalDataProvider {
  readonly code = "stooq";
  readonly label = "Stooq (daily)";
  readonly supports: HistoricalTimeframe[] = ["1D", "1W", "1M"];

  async fetchCandles({ nativeSymbol, timeframe, from, to }: {
    nativeSymbol: string; timeframe: HistoricalTimeframe; from: number; to: number;
  }): Promise<FetchCandlesResult> {
    if (!this.supports.includes(timeframe)) {
      throw new Error(`Stooq: intraday not supported (${timeframe}). Daily (1D) and above only.`);
    }
    const interval = timeframe === "1D" ? "d" : timeframe === "1W" ? "w" : "m";

    const url = new URL(STOOQ_BASE);
    url.searchParams.set("s", nativeSymbol.toLowerCase());
    url.searchParams.set("i", interval);
    const res = await fetch(url.toString(), { headers: { "User-Agent": "TradersHIVE/1.0" } });
    if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
    const csv = await res.text();
    if (!csv || csv.toLowerCase().startsWith("no data")) return { candles: [] };
    // Stooq now serves a JavaScript proof-of-work interstitial to non-browser
    // clients. Never treat that HTML as "no candles" — fail loudly so the
    // import job records a real error instead of silently importing nothing.
    const head = csv.trimStart().slice(0, 200).toLowerCase();
    if (head.startsWith("<") || head.includes("<!doctype") || head.includes("requires javascript")) {
      throw new Error(
        "Stooq returned a browser-verification page instead of CSV. This provider is currently blocked for server-side download; no data was imported.",
      );
    }
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return { candles: [] };
    if (!/^date,/i.test(lines[0])) {
      throw new Error(`Stooq returned an unexpected response format: ${lines[0].slice(0, 80)}`);
    }
    const out: HistoricalCandle[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [date, o, h, l, c, v] = lines[i].split(",");
      if (!date || !o) continue;
      const ts = new Date(`${date}T00:00:00Z`).getTime();
      if (!Number.isFinite(ts) || ts < from || ts > to) continue;
      const op = Number(o), hi = Number(h), lo = Number(l), cl = Number(c);
      if (!Number.isFinite(op + hi + lo + cl)) continue;
      out.push({ ts, open: op, high: hi, low: lo, close: cl, volume: Number(v || 0) });
    }
    // No `confirmedEmpty` on any of this provider's three empty exits. The
    // literal "no data" body above is the closest thing it has to a verdict,
    // but it is also what an unknown ticker returns — the ambiguity Twelve
    // Data's 400-plus-message pair is narrow enough to avoid. Unchanged.
    return { candles: out };
  }

  async earliest(nativeSymbol: string): Promise<number | null> {
    const { candles } = await this.fetchCandles({
      nativeSymbol, timeframe: "1D",
      from: 0, to: Date.now(),
    });
    return candles[0]?.ts ?? null;
  }
}

/* --------------------------- Twelve Data ---------------------------
 *
 * Canonical historical source for forex, metals, indices, commodities and
 * stocks. Intraday + daily. Key lives on the server only.
 */

const TD_BASE = "https://api.twelvedata.com";

const TD_INTERVAL: Partial<Record<HistoricalTimeframe, string>> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1H": "1h", "4H": "4h", "1D": "1day", "1W": "1week", "1M": "1month",
};

/**
 * Parse a response body that may not be JSON at all.
 *
 * Used on the error paths, where the body is already in hand as text and a
 * failure to parse is itself informative — an interstitial or proxy page is
 * not an empty window, and must keep falling through to the throw.
 */
function parseJsonBody(body: string): ProviderErrorBody | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Structured provider failure — always actionable, never silent. */
export class HistoricalProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
    readonly detail: {
      httpStatus?: number;
      responseType?: string;
      apiCode?: string;
      symbol?: string;
      timeframe?: string;
      body?: string;
      /**
       * CDN / edge headers captured at the failure, for diagnosis only.
       *
       * A CloudFront geographic block and a CloudFront rate block are both
       * HTTP 403 with an HTML body; only the headers and the PoP identify
       * which. Discarding them left a 403 unattributable — see the 2026-08-28
       * Bybit investigation, where the response was already gone by the time
       * anyone asked which edge served it.
       */
      headers?: Record<string, string>;
    } = {},
  ) {
    super(
      `[${provider}] ${reason}` +
        (detail.httpStatus ? ` (HTTP ${detail.httpStatus})` : "") +
        (detail.responseType ? ` [${detail.responseType}]` : "") +
        (detail.body ? `: ${detail.body.slice(0, 200)}` : ""),
    );
    this.name = "HistoricalProviderError";
  }
}

export class TwelveDataHistoricalProvider implements HistoricalDataProvider {
  readonly code = "twelvedata";
  readonly label = "Twelve Data";
  readonly supports: HistoricalTimeframe[] = ["1m","5m","15m","30m","1H","4H","1D","1W","1M"];

  private key(): string {
    const k = process.env.TWELVE_DATA_API_KEY;
    if (!k) {
      throw new HistoricalProviderError("twelvedata", "API key not configured (TWELVE_DATA_API_KEY missing)", {
        reason: "not_configured",
      } as any);
    }
    return k;
  }

  async fetchCandles({ nativeSymbol, timeframe, from, to }: {
    nativeSymbol: string; timeframe: HistoricalTimeframe; from: number; to: number;
  }): Promise<FetchCandlesResult> {
    const interval = TD_INTERVAL[timeframe];
    if (!interval) {
      throw new HistoricalProviderError("twelvedata", `unsupported timeframe ${timeframe}`, { symbol: nativeSymbol });
    }
    const apikey = this.key();
    const stepMs = HISTORICAL_TF_SECONDS[timeframe] * 1000;
    const PAGE = 5000;
    const out: HistoricalCandle[] = [];
    let cursor = from;
    let guard = 0;
    // Set ONLY by the two `isEmptyWindowError` sites below. The third exit on
    // an empty page (`values.length === 0`, a 200 with no error envelope) is
    // deliberately excluded: the provider said nothing there, so neither do we.
    let confirmedEmpty = false;

    while (cursor < to && guard++ < 50) {
      const pageTo = Math.min(to, cursor + PAGE * stepMs);
      const qs = new URLSearchParams({
        symbol: nativeSymbol,
        interval,
        order: "ASC",
        format: "JSON",
        outputsize: String(PAGE),
        start_date: new Date(cursor).toISOString().slice(0, 19),
        end_date: new Date(pageTo).toISOString().slice(0, 19),
        // Same trap as the live candle path: without this Twelve Data replies
        // in its own zone (UTC+10 for FX/metals when measured) while the parse
        // below appends "Z", writing every bar ~10 hours off into the shared
        // `historical_candles` cache. `start_date`/`end_date` are read in this
        // zone too, so it also keeps paging aligned.
        timezone: "UTC",
        apikey,
      });
      const res = await fetch(`${TD_BASE}/time_series?${qs.toString()}`);
      const contentType = res.headers.get("content-type") ?? "unknown";

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);

        // An empty window arrives as HTTP 400, so `res.ok` is false and this
        // guard throws before `res.json()` at the JSON branch below is ever
        // reached — which made the check down there unreachable for the one
        // case it was written for. Measured 2026-08-21 from the body alone;
        // the transport status was never part of that measurement, so both
        // walks kept treating "the market was shut" as a fault and burned
        // three retries on it every cycle.
        //
        // Same predicate, run here against the text this branch already holds.
        // Additive: the 200-path check stays, because a body-level error can
        // still arrive with `res.ok` true. Gated on 400 specifically — a 404
        // entitlement gate or a 429 throttle must never reach it.
        if (res.status === 400 && isEmptyWindowError(parseJsonBody(body))) {
          confirmedEmpty = true;
          break;
        }

        const planLocked = /available starting with|upgrade/i.test(body);
        throw new HistoricalProviderError(
          "twelvedata",
          res.status === 429
            ? "rate limit exceeded"
            : planLocked
              ? `symbol not included in the current Twelve Data plan (${nativeSymbol})`
              : "upstream request failed",
          { httpStatus: res.status, responseType: contentType, symbol: nativeSymbol, timeframe, body },
        );
      }

      if (!contentType.includes("json")) {
        const body = await res.text().catch(() => "");
        throw new HistoricalProviderError("twelvedata", "non-JSON response (possible interstitial or proxy page)", {
          httpStatus: res.status, responseType: contentType, symbol: nativeSymbol, timeframe, body,
        });
      }

      const json = (await res.json()) as any;
      // "No data on the specified dates" is an empty result wearing an error's
      // clothes. Translated here, at the boundary, so both walks see the empty
      // array the rest of the pipeline already knows how to handle. Narrow on
      // purpose — see `./provider-errors`.
      if (isEmptyWindowError(json)) {
        confirmedEmpty = true;
        break;
      }
      if (json?.status === "error") {
        throw new HistoricalProviderError("twelvedata", String(json.message ?? "API error"), {
          httpStatus: res.status, responseType: contentType, apiCode: String(json.code ?? ""),
          symbol: nativeSymbol, timeframe,
        });
      }
      const values: any[] = Array.isArray(json?.values) ? json.values : [];
      if (!values.length) break;

      let lastTs = cursor;
      for (const v of values) {
        const ts = new Date(String(v.datetime).replace(" ", "T") + (String(v.datetime).length <= 10 ? "T00:00:00Z" : "Z")).getTime();
        if (!Number.isFinite(ts) || ts < from || ts > to) continue;
        const o = Number(v.open), h = Number(v.high), l = Number(v.low), c = Number(v.close);
        if (!Number.isFinite(o + h + l + c)) continue;
        out.push({ ts, open: o, high: h, low: l, close: c, volume: Number(v.volume ?? 0) });
        if (ts > lastTs) lastTs = ts;
      }

      const next = lastTs + stepMs;
      if (next <= cursor) break;
      cursor = next;
      if (values.length < PAGE) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    out.sort((a, b) => a.ts - b.ts);
    return { candles: out, confirmedEmpty };
  }

  async earliest(nativeSymbol: string): Promise<number | null> {
    try {
      const qs = new URLSearchParams({
        symbol: nativeSymbol, interval: "1month", order: "ASC",
        outputsize: "1", format: "JSON", timezone: "UTC", apikey: this.key(),
      });
      const res = await fetch(`${TD_BASE}/time_series?${qs.toString()}`);
      if (!res.ok) return null;
      const json = (await res.json()) as any;
      const first = json?.values?.[0]?.datetime;
      if (!first) return null;
      const ts = new Date(String(first).replace(" ", "T") + "Z").getTime();
      return Number.isFinite(ts) ? ts : null;
    } catch {
      return null;
    }
  }
}

/* ------------------------------ Registry ------------------------------ */

const REGISTRY: Record<string, HistoricalDataProvider> = {
  bybit: new BybitHistoricalProvider(),
  // Retained though nothing routes to it: CX-1 blocks it from this deployment,
  // but `historical_candles` still holds rows written under `provider_code =
  // 'binance'`, and an explicit request must still resolve rather than throw.
  binance: new BinanceHistoricalProvider(),
  twelvedata: new TwelveDataHistoricalProvider(),
  // Optional, disabled by default — only reachable when a caller explicitly
  // requests it AND ENABLE_STOOQ_HISTORICAL=true (see historical/routing.ts).
  stooq: new StooqHistoricalProvider(),
};

/**
 * Codes that exist in older DB rows and must keep resolving until the
 * data migration has propagated everywhere.
 */
export const LEGACY_PROVIDER_CODES: Record<string, string> = {
  dukascopy: "stooq",
};

export function canonicalProviderCode(code: string): string {
  return LEGACY_PROVIDER_CODES[code] ?? code;
}

export function getHistoricalProvider(code: string): HistoricalDataProvider {
  const p = REGISTRY[canonicalProviderCode(code)];
  if (!p) throw new Error(`Unknown historical provider: ${code}`);
  return p;
}

export function listHistoricalProviders(): HistoricalDataProvider[] {
  return Object.values(REGISTRY);
}


