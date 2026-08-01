/**
 * Economic calendar ingestion (server only).
 *
 * Source: ForexFactory's free weekly JSON feeds mirrored by faireconomy.
 * They publish last / this / next week, so a scheduled run accumulates a
 * rolling history in our own table — which is what replay needs.
 */
import type { NewsImpact } from "./types";

const FEEDS = [
  "https://nfs.faireconomy.media/ff_calendar_lastweek.json",
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
] as const;

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

/** Fetch every feed and upsert into `economic_events`. Returns counts. */
export async function syncEconomicCalendar(): Promise<{ fetched: number; upserted: number; errors: string[] }> {
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

  return { fetched: rows.length, upserted, errors };
}
