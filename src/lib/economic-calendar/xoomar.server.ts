/**
 * Economic calendar ingestion — Xoomar (server only).
 *
 * ADDITIVE to `ingest.server.ts`, which stays the primary breadth source.
 * ForexFactory supplies ~66 events/week across every major currency and a
 * forecast for most of them, but structurally never publishes an outcome. This
 * supplies US high-signal releases WITH the outcome. Both write to
 * `economic_events` tagged by `source`, and nothing reconciles them — see
 * "Duplicates are accepted" below.
 *
 * Keyless, no auth. Measured 2026-08-24.
 *
 * ── The defect this module exists to filter out ────────────────────────────
 *
 * The response mixes TWO datasets in one array, and only one of them is a
 * calendar. Over 2026-01-01..2026-08-24 the split is 36 / 22:
 *
 *   Family A (36) — a macro time series wearing a calendar's clothes.
 *     `periodLabel` is "2026-07"; `scheduledAt` is the FIRST OF THAT MONTH.
 *     Its `actual` is the value for the period, stamped to the period's start
 *     rather than to the date it was published. Measured pairs, every month:
 *
 *       stamped 2026-01-01 actual=160.0 -> published 2026-02-11  (41 days early)
 *       stamped 2026-07-01 actual=-23.0 -> published 2026-08-07  (37 days early)
 *
 *     41, 33, 33, 37, 35, 31, 37 days of look-ahead. A replay session on
 *     2026-07-15 reading these would show July non-farm payrolls at -23.0, a
 *     number that did not exist until 2026-08-07.
 *
 *   Family B (22) — a genuine release calendar. `periodLabel` is
 *     "June 2026" / "July 2026 meeting" / "Q2 2026 Advance"; `scheduledAt` is
 *     the real publication datetime. `actual` populated 22/22.
 *
 * `economic_events` feeds the replay overlay, whose entire purpose is showing
 * what was knowable at that bar. Family A is therefore not "lower quality
 * data" to be de-prioritised — it is a correctness hazard, and this module
 * must never write it.
 *
 * ── Why the filter is a whitelist ──────────────────────────────────────────
 *
 * Blacklisting the "YYYY-MM" shape would work today and fail silently the day
 * Xoomar adds a third label format: an unrecognised record would sail through
 * as if it were a release. So `classify` ACCEPTS only shapes measured to be
 * publication-dated and rejects everything else with a warning. A new format
 * shows up in the sync log as a named string instead of as bad data in the
 * table.
 *
 * Two independent signals back each other up, both verified over the 58-record
 * window: Family A is ALWAYS day-1 of a month (36/36) and Family B is NEVER
 * (0/22). So an unlabelled record is accepted only when it is not day-1.
 *
 * ── Fields ─────────────────────────────────────────────────────────────────
 *
 * No `currency` or `country` field exists; `source` is bls / bea / fed, all US.
 * A `forecast` key IS present on every record but was null on all 58 — it is
 * read defensively anyway, so if Xoomar ever populates it we get it for free
 * rather than needing a code change to notice.
 *
 * `scheduledAt` is genuine UTC and DST-aware: verified against US Eastern
 * release times, 21 of 22 land exactly on 08:30 ET (BLS/BEA) or 14:00 ET
 * (FOMC). The exception is 2026-03-06, stamped 12:30Z = 07:30 ET when 2026 DST
 * did not begin until March 8 — an hour early. Known upstream bug, not
 * corrected here: `event_time` is part of the unique key, so silently shifting
 * it would fork one event into two rows across a re-fetch.
 *
 * ── Duplicates are accepted, deliberately ──────────────────────────────────
 *
 * `economic_events` is unique on `(event_time, currency, title)`. FF's
 * "Non-Farm Employment Change" and this source's "Nonfarm Payrolls (Employment
 * Situation)" are the same real release and will NOT collide, so a
 * high-visibility event can produce two rows — one with a forecast and no
 * actual, one with an actual and no forecast. Accepted until real usage shows
 * it needs a precedence rule.
 *
 * ── Cadence ────────────────────────────────────────────────────────────────
 *
 * Daily, in the same cron route as ForexFactory. The window is fetched in ONE
 * request, against a measured limit of 30/min keyless (burst-tested: 200 x 30,
 * then 429 at request 31 carrying `retry-after: 37`). A 60-second edge cache
 * means polling faster than that returns the same bytes anyway.
 */
import type { Json } from "@/integrations/supabase/types";
import type { NewsImpact } from "./types";

const ENDPOINT = "https://xoomar.com/api/markets/calendar";

/**
 * Window fetched each run, in days either side of today.
 *
 * Backwards because `actual` is null until the release fires and is filled in
 * afterwards — re-reading recent days is how an outcome reaches us at all.
 * Forwards to accumulate the schedule ahead of the session that needs it.
 */
const DAYS_BACK = 7;
const DAYS_FORWARD = 45;

/** All three publishers are US federal agencies. */
const SOURCE_TO_CURRENCY: Readonly<Record<string, string>> = {
  bls: "USD", // Bureau of Labor Statistics
  bea: "USD", // Bureau of Economic Analysis
  fed: "USD", // Federal Reserve
};

const MONTH_LABEL =
  /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}( meeting)?$/;
const QUARTER_LABEL = /^Q[1-4] \d{4}\b/;
/** The look-ahead family's signature. */
const PERIOD_START_LABEL = /^\d{4}-\d{2}$/;

type XoomarItem = {
  source?: string;
  eventName?: string;
  importance?: string;
  scheduledAt?: string;
  periodLabel?: string | null;
  previous?: string | null;
  forecast?: string | null;
  actual?: string | null;
};

export interface XoomarRow {
  event_time: string;
  currency: string;
  title: string;
  impact: NewsImpact;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string;
  raw_payload: Json;
}

export function normaliseImpact(raw: string | undefined): NewsImpact {
  const v = (raw ?? "").toLowerCase();
  if (v.startsWith("high")) return "high";
  // The API abbreviates medium to "med".
  if (v.startsWith("med")) return "medium";
  if (v.startsWith("holiday")) return "holiday";
  return "low";
}

export type Classification =
  | { keep: true }
  | { keep: false; reason: string };

/**
 * Is this record publication-dated, or is it a period-start stamp?
 *
 * Accepts only shapes measured to be genuine releases. Everything else is
 * refused by default — including formats that do not exist yet.
 */
export function classify(periodLabel: string | null | undefined, scheduledAt: string): Classification {
  const label = periodLabel == null ? null : String(periodLabel).trim();
  const day = new Date(scheduledAt).getUTCDate();

  if (label !== null && PERIOD_START_LABEL.test(label)) {
    return { keep: false, reason: `period-start record (periodLabel "${label}") — carries look-ahead, never ingested` };
  }
  if (label === null) {
    // Unlabelled. Family A is always day-1 and Family B never is, so day-1
    // without a label is refused rather than guessed at.
    return day === 1
      ? { keep: false, reason: `unlabelled record stamped day-1 (${scheduledAt}) — indistinguishable from a period-start stamp` }
      : { keep: true };
  }
  if (MONTH_LABEL.test(label) || QUARTER_LABEL.test(label)) {
    return day === 1
      ? { keep: false, reason: `release-shaped label "${label}" but stamped day-1 (${scheduledAt}) — contradictory, refused` }
      : { keep: true };
  }
  return { keep: false, reason: `unrecognised periodLabel "${label}" — add its shape to classify() if it is a real release` };
}

function orNull(v: string | null | undefined): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

export interface ParseResult {
  rows: XoomarRow[];
  /** Notes for the sync log. Never fatal. */
  warnings: string[];
  /** Records refused by `classify`. Reported so the filter's bite is visible. */
  filtered: number;
}

/**
 * Normalise the `data` array into rows.
 *
 * Pure, so the look-ahead filter and the timestamp rules are testable without
 * a network — the same reason `parseFeed` is separated in `ingest.server.ts`,
 * and the reason the filter can be asserted directly rather than inferred from
 * what reached the database.
 */
export function parseCalendar(items: unknown): ParseResult {
  const rows: XoomarRow[] = [];
  const warnings: string[] = [];
  let filtered = 0;
  if (!Array.isArray(items)) return { rows, warnings, filtered };

  for (const raw of items as XoomarItem[]) {
    const at = raw?.scheduledAt;
    const ts = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(ts)) {
      warnings.push(`skipped: unusable scheduledAt ${JSON.stringify(at)}`);
      continue;
    }
    const title = String(raw?.eventName ?? "").trim();
    if (!title) {
      warnings.push(`skipped: empty eventName at ${at}`);
      continue;
    }

    const verdict = classify(raw?.periodLabel, at as string);
    if (!verdict.keep) {
      // Counted, not warned line-by-line: 36 of 58 records are refused on a
      // normal run, and 36 warnings every day would bury the ones that matter.
      filtered++;
      continue;
    }

    const currency = SOURCE_TO_CURRENCY[String(raw?.source ?? "").toLowerCase()];
    if (!currency) {
      // Refused rather than defaulted to USD. This source is US-only today,
      // but a guessed currency files a foreign release against the wrong
      // instrument, which looks entirely legitimate on the chart.
      warnings.push(
        `skipped: no currency mapping for source "${raw?.source ?? ""}" (${title}) — add it to SOURCE_TO_CURRENCY`,
      );
      continue;
    }

    rows.push({
      event_time: new Date(ts).toISOString(),
      currency,
      title: title.slice(0, 300),
      impact: normaliseImpact(raw?.importance),
      actual: orNull(raw?.actual),
      // Present but null on all 58 measured records. Read anyway, so the day
      // it starts arriving we get it without a code change.
      forecast: orNull(raw?.forecast),
      previous: orNull(raw?.previous),
      source: "xoomar",
      raw_payload: raw,
    });
  }
  return { rows, warnings, filtered };
}

export class XoomarRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super(`xoomar rate limited${retryAfterSeconds ? ` (retry after ${retryAfterSeconds}s)` : ""}`);
    this.name = "XoomarRateLimitError";
  }
}

/** `yyyy-MM-dd` in UTC — the format `from` / `to` accept. */
export function toWindowDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fetch one window. Throws on transport, rate limit, or malformed envelope. */
export async function fetchWindow(from: string, to: string): Promise<ParseResult> {
  const res = await fetch(`${ENDPOINT}?from=${from}&to=${to}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    throw new XoomarRateLimitError(Number.isFinite(ra) ? ra : null);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const json = (await res.json()) as { data?: unknown };
  if (!Array.isArray(json?.data)) throw new Error("envelope missing a `data` array");
  return parseCalendar(json.data);
}

export interface XoomarSyncResult {
  fetched: number;
  upserted: number;
  errors: string[];
  warnings: string[];
  /** Look-ahead and unrecognised records refused before the write. */
  filtered: number;
  windowFrom: string | null;
  windowTo: string | null;
  /**
   * Rows carrying a published outcome — the number that justifies this
   * provider existing, since ForexFactory's equivalent is structurally always
   * 0. Reported rather than inferred from a row count.
   */
  withActual: number;
}

/** Fetch the window and upsert into `economic_events`. */
export async function syncXoomarCalendar(now: Date = new Date()): Promise<XoomarSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const errors: string[] = [];
  const warnings: string[] = [];
  let rows: XoomarRow[] = [];
  let filtered = 0;

  const from = toWindowDate(new Date(now.getTime() - DAYS_BACK * 86_400_000));
  const to = toWindowDate(new Date(now.getTime() + DAYS_FORWARD * 86_400_000));

  try {
    const r = await fetchWindow(from, to);
    rows = r.rows;
    warnings.push(...r.warnings);
    filtered = r.filtered;
  } catch (e) {
    errors.push(`${from}..${to}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // De-duplicate on the table's unique key before the write.
  const unique = new Map<string, XoomarRow>();
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
    filtered,
    windowFrom: times[0] ?? null,
    windowTo: times[times.length - 1] ?? null,
    withActual: payload.filter((r) => r.actual != null).length,
  };
}
