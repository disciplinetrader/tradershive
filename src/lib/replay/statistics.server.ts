/**
 * Phase 8C · aggregate replay statistics.
 *
 * Extracted so the legacy finish path and the canonical Studio scoring path
 * share ONE implementation instead of two drifting copies.
 */

type Sb = {
  from: (t: string) => any;
};

export async function refreshReplayStatistics(sb: Sb, userId: string): Promise<void> {
  const [{ data: sessions }, { data: scores }] = await Promise.all([
    sb.from("replay_sessions").select("id, market, symbol, duration_seconds").eq("user_id", userId).is("deleted_at", null),
    sb.from("replay_scores").select("score").eq("user_id", userId),
  ]);

  const list = (sessions ?? []) as Array<{ market: string; symbol: string; duration_seconds: number | null }>;
  const scoreRows = (scores ?? []) as Array<{ score: number | null }>;

  const marketCounts = new Map<string, number>();
  const symbolCounts = new Map<string, number>();
  for (const s of list) {
    if (s.market) marketCounts.set(s.market, (marketCounts.get(s.market) ?? 0) + 1);
    if (s.symbol) symbolCounts.set(s.symbol, (symbolCounts.get(s.symbol) ?? 0) + 1);
  }

  await sb.from("replay_statistics").upsert({
    user_id: userId,
    total_sessions: list.length,
    total_hours: list.reduce((s, x) => s + (x.duration_seconds ?? 0), 0) / 3600,
    average_score: scoreRows.length
      ? Math.round(scoreRows.reduce((s, x) => s + (x.score ?? 0), 0) / scoreRows.length)
      : 0,
    most_practiced_market: [...marketCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    most_practiced_symbol: [...symbolCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    last_practiced_at: new Date().toISOString(),
  });
}
