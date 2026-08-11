/**
 * Daily journal — the day as the unit, rather than the trade.
 *
 * A trading day has things a trade does not: a plan written before the market
 * opened, and a recap written after it closed. Those are the two texts stored
 * here; everything else on the page is derived from the day's entries so the
 * numbers can never disagree with the calendar or the reports.
 *
 * Days are attributed in the trader's timezone, the same as the calendar —
 * `dayKey(epochMs, tz)`, never local `getDate()`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { JournalEntry } from "@/lib/journal/api";
import { dayKey } from "@/lib/analytics/periods";
import { countsTowardAnalytics } from "@/lib/journal/metrics";

export type JournalDay = Database["public"]["Tables"]["journal_days"]["Row"];

export const dayKeys = {
  all: ["journal", "days"] as const,
  one: (day: string) => ["journal", "days", day] as const,
};

/** `yyyy-mm-dd` for an entry, in the display timezone. */
export function entryDay(e: JournalEntry, timezone: string): string | null {
  const iso = e.closed_at ?? e.opened_at ?? e.created_at;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? dayKey(ms, timezone) : null;
}

/** Entries belonging to one day, newest first. */
export function entriesForDay(
  entries: JournalEntry[],
  day: string,
  timezone: string,
): JournalEntry[] {
  return entries
    .filter((e) => entryDay(e, timezone) === day)
    .sort((a, b) => Date.parse(b.closed_at ?? b.created_at) - Date.parse(a.closed_at ?? a.created_at));
}

/** Every day that has at least one countable entry, newest first. */
export function tradedDays(entries: JournalEntry[], timezone: string): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    if (!countsTowardAnalytics(e)) continue;
    const d = entryDay(e, timezone);
    if (d) set.add(d);
  }
  return [...set].sort().reverse();
}

/** Previous / next day that actually has trades — skips empty days entirely. */
export function adjacentTradedDays(
  days: string[],
  current: string,
): { prev: string | null; next: string | null } {
  // `days` is newest-first, so "next" (later in time) is the earlier index.
  const i = days.indexOf(current);
  if (i === -1) {
    const later = days.filter((d) => d > current);
    const earlier = days.filter((d) => d < current);
    return { prev: earlier[0] ?? null, next: later[later.length - 1] ?? null };
  }
  return { prev: days[i + 1] ?? null, next: i > 0 ? days[i - 1] : null };
}

export async function fetchDay(day: string): Promise<JournalDay | null> {
  const { data, error } = await supabase
    .from("journal_days")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveDay(input: {
  userId: string;
  day: string;
  plan_text?: string | null;
  recap_text?: string | null;
}): Promise<JournalDay> {
  const { userId, day, ...patch } = input;
  const { data, error } = await supabase
    .from("journal_days")
    .upsert(
      { user_id: userId, day, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id,day" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
