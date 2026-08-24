/**
 * Economic calendar — shared types.
 *
 * Events are stored server-side (table `economic_events`) so replay sessions
 * can show the macro context that actually existed at that bar, rather than a
 * live-only feed that has no history.
 */

export type NewsImpact = "high" | "medium" | "low" | "holiday";

export interface EconomicEvent {
  id: string;
  /** Release time in epoch ms (UTC). */
  timeMs: number;
  currency: string;
  title: string;
  impact: NewsImpact;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  /**
   * Which ingest wrote the row — 'faireconomy' or 'xoomar'.
   *
   * Surfaced because the two sources deliberately do NOT de-duplicate: the
   * same US release arrives from both under different titles and cannot
   * collide on the unique key. Without the tag, two near-identical NFP rows
   * read as a rendering bug rather than the decision they are.
   */
  source: string;
}

export const IMPACT_ORDER: Record<NewsImpact, number> = {
  high: 0,
  medium: 1,
  low: 2,
  holiday: 3,
};

/** Currencies a symbol is exposed to — used to filter the calendar per chart. */
export function currenciesForSymbol(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  const known = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"];
  const hits = known.filter((c) => s.includes(c));
  if (hits.length) return hits;
  // Metals, indices and crypto all trade off the dollar leg.
  return ["USD"];
}
