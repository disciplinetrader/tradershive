/**
 * Economic calendar ingestion — moomoo `hot` (server only).
 *
 * ADDITIVE to `ingest.server.ts`, which stays the primary breadth source.
 * ForexFactory supplies ~66 events/week across every major currency but never
 * publishes an outcome; this supplies US high-signal releases WITH the
 * outcome. Both write to `economic_events` tagged by `source`, and nothing
 * reconciles them — see "Duplicates are accepted" below.
 *
 * ── Why `hot` and not `search` ─────────────────────────────────────────────
 *
 * `/economic-calendar/search` carries the same fields but cannot be asked for
 * a date. Measured 2026-08-24: it takes `keyword` + `search_type` only —
 * `begin_time`, `start_time`, `from`/`to`, `date`, `order`, `sort`, `sort_by`
 * are all silently ignored, and `time_order_type` is documented (and measured)
 * to apply to `search_type=2/3` only, never to `search_type=1`, the one type
 * carrying `announce`/`predictive`. Its results are relevance-ranked, so
 * `keyword=CPI` returns a window from 2026-07-20..07-30 — four weeks stale,
 * containing nothing from the current week. A keyword list cannot fix that.
 *
 * `hot` is addressed BY DATE and is therefore the only endpoint that can
 * answer "what happened in this window", which is what both the daily sync and
 * the replay overlay ask.
 *
 * ── What `hot` costs us: it is small ───────────────────────────────────────
 *
 * Measured over 2026-08-10..08-31: 8 events in 22 days (0.4/day), 14 of those
 * days empty, 100% 美国. That is ~4% of ForexFactory's volume. It is a curated
 * top-events feed, not a calendar, and it is not a candidate to replace FF.
 * What it does have, and nothing else we tested does, is `previous` AND
 * `predictive` (forecast) AND `announce` (actual) on the same record —
 * measured 5/5 populated on past dates, 0/3 on future ones.
 *
 * ── Two silent-failure traps, both measured ────────────────────────────────
 *
 * This API ignores malformed parameters instead of rejecting them, so a wrong
 * value looks exactly like an empty day:
 *
 *   · `date` must be `yyyyMMdd`. `date=2026-08-25` returns 0 rows and ret_code
 *     0. This cost one round of investigation already.
 *   · `timezone` is case-sensitive. `timezone=UTC` works; `timezone=utc`
 *     returns 0 rows, again with ret_code 0.
 *
 * `event_time` is an absolute epoch and is NOT shifted by `timezone` — that
 * parameter only picks which day the `date` bucket covers. Verified against
 * the 2026-08-07 non-farm payrolls release, whose real time is 08:30
 * America/New_York (EDT) = 12:30:00Z: every one of UTC, Etc/UTC,
 * America/New_York, Asia/Shanghai, GMT and omitting the parameter returned
 * 1786105800 = 2026-08-07T12:30:00.000Z.
 *
 * ── Errors do not arrive as HTTP errors ────────────────────────────────────
 *
 * A rejected request is HTTP 200 with a negative `ret_code`
 * (`limit=50` → `{"ret_code":-3,"ret_msg":"parameter 'limit' exceeds maximum
 * value 30"}`). `res.ok` is not a success test here; `ret_code === 0` is.
 *
 * ── Duplicates are accepted, deliberately ──────────────────────────────────
 *
 * `economic_events` is unique on `(event_time, currency, title)`. FF's
 * "Non-Farm Employment Change" and this source's "US Non-Farm Payrolls
 * (seasonally adjusted)" are the same real release and will NOT collide, so a
 * high-visibility event can produce two rows — one with a forecast and no
 * actual, one with both. That is a known, accepted outcome until real usage
 * shows it needs a precedence rule; building a cross-source mapping table
 * before then would be guessing at which titles need pairing.
 *
 * ── Cadence ────────────────────────────────────────────────────────────────
 *
 * Daily, alongside the FF sync, in the same cron route. The published rate
 * limit page states quotas exist but names no numbers; it documents 429 with
 * `Retry-After` and recommends exponential backoff. At WINDOW_DAYS requests
 * per day this is nowhere near any plausible ceiling, and a 429 aborts the run
 * rather than retrying into it.
 */
import { createPrivateKey, sign as edSign, randomBytes } from "node:crypto";
import type { NewsImpact } from "./types";
import { lookupCurrency, lookupTitle } from "./moomoo-strings";

const HOST = "https://webapi.moomoo.com";
const PATH = "/api/v1.0/quote/economic-calendar/hot";

/** `hot` accepts 1..20; the busiest measured day held 2. */
const PAGE_LIMIT = 20;

/**
 * Days behind and ahead of today to poll, one request each.
 *
 * Backwards because `announce` is empty until the release fires and is filled
 * in afterwards — re-reading recent days is how an outcome reaches us at all,
 * and it also picks up revisions. Forwards to accumulate the schedule before
 * it happens, which is what the overlay needs for an upcoming session.
 */
const DAYS_BACK = 3;
const DAYS_FORWARD = 10;
export const WINDOW_DAYS = DAYS_BACK + 1 + DAYS_FORWARD;

interface HotItem {
  event_text?: string;
  country?: string;
  currency?: string | null;
  event_time?: number;
  previous?: string | null;
  predictive?: string | null;
  announce?: string | null;
  star?: number;
  unique_id?: string | null;
  unit?: string | null;
  detail_url?: string | null;
}

export interface MoomooRow {
  event_time: string;
  currency: string;
  title: string;
  impact: NewsImpact;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string;
  raw_payload: unknown;
}

/**
 * `star` is documented 1..5, 5 most important. Every event the probe returned
 * was star 3, so the boundaries below are unexercised by measurement — they
 * are set so that anything this feed bothers to call "hot" lands at least at
 * medium, because a curated top-events feed publishing a genuinely low-impact
 * release is not a case worth optimising for.
 */
export function impactFromStar(star: number | undefined): NewsImpact {
  if (typeof star !== "number" || !Number.isFinite(star)) return "medium";
  if (star >= 3) return "high";
  if (star >= 2) return "medium";
  return "low";
}

/** `yyyyMMdd` in UTC — the only format `hot` accepts. */
export function toHotDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Empty string and whitespace both mean "not published"; null-normalise them. */
function orNull(v: string | null | undefined): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

export interface ParseResult {
  rows: MoomooRow[];
  /** Human-readable notes for the sync log. Never fatal. */
  warnings: string[];
}

/**
 * Normalise one `hot` page into rows.
 *
 * Pure, so the timestamp and mapping rules are testable without a network or a
 * signing key — the same reason `parseFeed` is separated in `ingest.server.ts`.
 */
export function parseHot(items: unknown): ParseResult {
  const rows: MoomooRow[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(items)) return { rows, warnings };

  for (const raw of items as HotItem[]) {
    const ts = raw?.event_time;
    // Seconds, not milliseconds — everything else in this table is an ISO
    // string, so the conversion happens once, here.
    if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) {
      warnings.push(`skipped: unusable event_time ${JSON.stringify(raw?.event_time)}`);
      continue;
    }
    // `<em>` tags wrap the matched term on the /search endpoint. `hot` takes no
    // keyword so it should never emit them, but they are stripped anyway — the
    // title is a unique-key component and an unnoticed tag would fork one
    // event into two rows.
    const zh = String(raw?.event_text ?? "").replace(/<[^>]+>/g, "").trim();
    if (!zh) {
      warnings.push(`skipped: empty event_text at ${new Date(ts * 1000).toISOString()}`);
      continue;
    }

    const currency = lookupCurrency(raw?.country);
    if (!currency) {
      // Refused rather than defaulted. A guessed currency files the release
      // against the wrong instrument; a warning names the exact string to add
      // to COUNTRY_TO_CURRENCY.
      warnings.push(
        `skipped: no currency mapping for country "${raw?.country ?? ""}" (${zh}) — add it to COUNTRY_TO_CURRENCY`,
      );
      continue;
    }

    const { title, matched } = lookupTitle(zh);
    if (!matched) {
      // Kept, not skipped: the untranslated label is cosmetic, the `announce`
      // it carries is the point of this provider.
      warnings.push(`untranslated title "${zh}" — stored as-is; add it to TITLE_ZH_TO_EN`);
    }

    rows.push({
      event_time: new Date(ts * 1000).toISOString(),
      currency,
      title: title.slice(0, 300),
      impact: impactFromStar(raw?.star),
      actual: orNull(raw?.announce),
      forecast: orNull(raw?.predictive),
      previous: orNull(raw?.previous),
      source: "moomoo",
      raw_payload: raw,
    });
  }
  return { rows, warnings };
}

/** Ed25519 request signing. Same construction verified against `/search`. */
function signedHeaders(path: string, query: string): Record<string, string> {
  const appKey = process.env.MOOMOO_APP_KEY;
  const privB64 = process.env.MOOMOO_PRIVATE_KEY;
  if (!appKey || !privB64) throw new Error("moomoo_not_configured");

  const ts = Date.now().toString();
  // The body part is empty for GET, but its trailing newline is NOT optional —
  // the string is always five parts.
  const signStr = `${ts}\nGET\n${path}\n${query}\n`;
  const key = createPrivateKey({
    key: Buffer.from(privB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return {
    Authorization: edSign(null, Buffer.from(signStr, "utf8"), key).toString("base64"),
    "X-Api-Key": appKey,
    "X-Timestamp": ts,
    "X-Nonce": randomBytes(16).toString("hex"),
    Accept: "application/json",
  };
}

export class MoomooRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super(`moomoo rate limited${retryAfterSeconds ? ` (retry after ${retryAfterSeconds}s)` : ""}`);
    this.name = "MoomooRateLimitError";
  }
}

/** One day of `hot`, already normalised. Throws on transport or API error. */
export async function fetchHotDay(date: string): Promise<ParseResult> {
  // `timezone=UTC` — exact case. Lowercase silently returns nothing.
  const query = `date=${date}&timezone=UTC&limit=${PAGE_LIMIT}`;
  const res = await fetch(`${HOST}${PATH}?${query}`, { headers: signedHeaders(PATH, query) });

  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    throw new MoomooRateLimitError(Number.isFinite(ra) ? ra : null);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const json = (await res.json()) as { ret_code?: number; ret_msg?: string; data?: unknown };
  // Rejections arrive as HTTP 200 with a negative ret_code.
  if (json?.ret_code !== 0) {
    throw new Error(`ret_code ${json?.ret_code}: ${json?.ret_msg ?? "unknown error"}`);
  }
  return parseHot(json.data);
}

export interface MoomooSyncResult {
  fetched: number;
  upserted: number;
  errors: string[];
  warnings: string[];
  daysQueried: number;
  windowFrom: string | null;
  windowTo: string | null;
  /**
   * Rows carrying a published outcome. This is the number that justifies the
   * provider existing at all — ForexFactory's equivalent is structurally
   * always 0 — so it is reported rather than inferred from a row count.
   */
  withActual: number;
}

/** Poll the window one day at a time and upsert into `economic_events`. */
export async function syncMoomooCalendar(now: Date = new Date()): Promise<MoomooSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: MoomooRow[] = [];
  let daysQueried = 0;

  for (let offset = -DAYS_BACK; offset <= DAYS_FORWARD; offset++) {
    const day = new Date(now.getTime() + offset * 86_400_000);
    const date = toHotDate(day);
    try {
      const r = await fetchHotDay(date);
      rows.push(...r.rows);
      warnings.push(...r.warnings);
      daysQueried++;
    } catch (e) {
      if (e instanceof MoomooRateLimitError) {
        // Stop rather than continue: the remaining days would spend the same
        // exhausted budget and fail identically. Daily cadence means the next
        // run is a fresh window, and the days already collected still land.
        errors.push(`${date}: ${e.message} — aborting remaining days`);
        break;
      }
      errors.push(`${date}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // De-duplicate on the table's unique key before the write. Overlapping days
  // cannot produce a collision, but a same-day revision within one page can.
  const unique = new Map<string, MoomooRow>();
  for (const r of rows) unique.set(`${r.event_time}|${r.currency}|${r.title}`, r);
  const payload = [...unique.values()];

  let upserted = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await supabaseAdmin
      .from("economic_events")
      .upsert(chunk, { onConflict: "event_time,currency,title" });
    // supabase-js returns { error }; it does not throw. An unread result here
    // would report a successful sync that wrote nothing.
    if (error) errors.push(error.message);
    else upserted += chunk.length;
  }

  const times = payload.map((r) => r.event_time).sort();
  return {
    fetched: rows.length,
    upserted,
    errors,
    warnings,
    daysQueried,
    windowFrom: times[0] ?? null,
    windowTo: times[times.length - 1] ?? null,
    withActual: payload.filter((r) => r.actual != null).length,
  };
}
