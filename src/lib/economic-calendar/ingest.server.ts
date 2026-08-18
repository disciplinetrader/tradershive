/**
 * Economic calendar ingestion (server only).
 *
 * Source: ForexFactory's free calendar feed, mirrored by faireconomy.
 *
 * ── What this can and cannot do ────────────────────────────────────────────
 *
 * This module used to request last / this / next week. Measured 2026-08-18,
 * **only `thisweek` still exists** — `ff_calendar_lastweek.json` and
 * `ff_calendar_nextweek.json` both return 404, in JSON and in XML, and
 * forexfactory.com itself answers 403 to a direct fetch. Every run was
 * therefore reporting two errors and `ok: false`, which is worse than useless:
 * a job that always fails is a job nobody reads the status of.
 *
 * The consequence is not cosmetic. The publisher serves ONE WEEK, forward
 * only, so this job cannot backfill. It accumulates history from the first run
 * onward and no earlier. A replay of a date before that first run will
 * correctly show no events, because we have none — see EC-1 in
 * docs/replay-studio-phase2.md, which is a data-provider decision and not a
 * code task.
 *
 * ── This source never publishes results ────────────────────────────────────
 *
 * Measured on the live payload, 2026-08-18: the feed carries exactly
 * `title, country, date, impact, forecast, previous`. There is **no `actual`
 * field at all** — 0 of 96 items had one, including the 30 whose release time
 * had already passed. `parseFeed` still reads `actual` defensively and the
 * column still exists, but with this provider it will stay null for ever.
 *
 * So the overlay can show a trader what was SCHEDULED and what was expected,
 * never what came out. That is a limitation of the source, not of the code,
 * and it is part of the EC-1 provider decision.
 *
 * ── Cadence ────────────────────────────────────────────────────────────────
 *
 * At least weekly, because a window missed is a window lost for ever. DAILY is
 * better, for two reasons that survive the finding above: a single failed run
 * (see the rate limit below) then costs a day rather than a week, and
 * `forecast` / `previous` are revised during the week the feed covers.
 *
 * The upsert key is (event_time, currency, title) — verified unique across all
 * 96 rows of a real payload — so repeated runs inside one week are free.
 *
 * Do not run it much more often than that: the host rate-limits. Measured
 * 2026-08-18, a short burst of requests earned an HTTP 429 with an HTML body.
 * Both failure modes are already handled — a non-OK status throws, and an HTML
 * body fails `res.json()` — and either way the run records an error and
 * changes nothing, so a rate-limited day is a no-op rather than a corruption.
 */
import type { NewsImpact } from "./types";

const FEEDS = ["https://nfs.faireconomy.media/ff_calendar_thisweek.json"] as const;

interface FeedItem {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

function normaliseImpact(raw: string | undefined): NewsImpact {
  const v = (raw ?? "").toLowerCase();
  if (v.startsWith("high")) return "high";
  if (v.startsWith("med")) return "medium";
  if (v.startsWith("holiday") || v.startsWith("non")) return "holiday";
  return "low";
}

export interface CalendarRow {
  event_time: string;
  currency: string;
  title: string;
  impact: NewsImpact;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string;
}

export function parseFeed(items: unknown): CalendarRow[] {
  if (!Array.isArray(items)) return [];
  const out: CalendarRow[] = [];
  for (const raw of items as FeedItem[]) {
    const ts = raw?.date ? Date.parse(raw.date) : NaN;
    if (!Number.isFinite(ts) || !raw?.title || !raw?.country) continue;
    out.push({
      event_time: new Date(ts).toISOString(),
      currency: String(raw.country).toUpperCase(),
      title: String(raw.title).slice(0, 300),
      impact: normaliseImpact(raw.impact),
      actual: raw.actual ? String(raw.actual) : null,
      forecast: raw.forecast ? String(raw.forecast) : null,
      previous: raw.previous ? String(raw.previous) : null,
      source: "faireconomy",
    });
  }
  return out;
}

export interface CalendarSyncResult {
  fetched: number;
  upserted: number;
  errors: string[];
  /** Window the run actually covered, so an operator can see what landed. */
  windowFrom: string | null;
  windowTo: string | null;
  /**
   * Events carrying a published result. Expected to be 0 with the current
   * provider, which serves no `actual` field — kept as a canary, so a source
   * that ever starts supplying outcomes shows up without anyone looking.
   */
  withActual: number;
}

/** Fetch the feed and upsert into `economic_events`. */
export async function syncEconomicCalendar(): Promise<CalendarSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const errors: string[] = [];
  const rows: CalendarRow[] = [];

  for (const url of FEEDS) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      rows.push(...parseFeed(await res.json()));
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // De-duplicate on the table's unique key before hitting the DB.
  const unique = new Map<string, CalendarRow>();
  for (const r of rows) unique.set(`${r.event_time}|${r.currency}|${r.title}`, r);
  const payload = [...unique.values()];

  let upserted = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await supabaseAdmin
      .from("economic_events")
      .upsert(chunk, { onConflict: "event_time,currency,title" });
    if (error) errors.push(error.message);
    else upserted += chunk.length;
  }

  // Report the window rather than only a count: "412 upserted" cannot tell an
  // operator whether the job is accumulating history or re-writing one week.
  const times = payload.map((r) => r.event_time).sort();

  return {
    fetched: rows.length,
    upserted,
    errors,
    windowFrom: times[0] ?? null,
    windowTo: times[times.length - 1] ?? null,
    withActual: payload.filter((r) => r.actual != null).length,
  };
}
