/**
 * Replay dataset provenance — the canonical model.
 *
 * Every replay session records where its candles actually came from. The
 * record is written once, when the dataset is first resolved and frozen, and
 * is read back from the database afterwards (never recomputed from transient
 * request state).
 *
 * Sessions created before this model existed have all-null provenance and are
 * reported honestly as "Legacy session — provenance unavailable".
 */

export type CoverageStatus = "complete" | "partial" | "unavailable" | "demo";

export type KnownGap = { from: string; to: string; missing: number };

/** Columns persisted on `replay_sessions`. All nullable for legacy rows. */
export type SessionProvenance = {
  source_provider: string | null;
  source_type: string | null;
  imported_at: string | null;
  requested_start: string | null;
  requested_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  candle_count: number | null;
  expected_candle_count: number | null;
  coverage_status: CoverageStatus | null;
  known_gaps: KnownGap[] | null;
  canonical_symbol: string | null;
  market: string | null;
  exchange: string | null;
  timezone: string | null;
  adjustment_mode: string | null;
  data_version: string | null;
  provenance_recorded_at: string | null;
};

export const LEGACY_PROVENANCE_LABEL = "Legacy session — provenance unavailable";

export function hasProvenance(p: Partial<SessionProvenance> | null | undefined): boolean {
  return !!p && !!p.provenance_recorded_at && !!p.source_provider;
}

export function serializeGaps(
  gaps: Array<{ from: number; to: number; missing: number }> | null | undefined,
): KnownGap[] {
  return (gaps ?? []).map((g) => ({
    from: new Date(g.from).toISOString(),
    to: new Date(g.to).toISOString(),
    missing: g.missing,
  }));
}

export function deserializeGaps(raw: unknown): Array<{ from: number; to: number; missing: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g: any) => ({
      from: +new Date(g?.from),
      to: +new Date(g?.to),
      missing: Number(g?.missing ?? 0),
    }))
    .filter((g) => Number.isFinite(g.from) && Number.isFinite(g.to));
}

export function coverageStatusFor(opts: {
  ok: boolean;
  gaps: number;
  isSynthetic: boolean;
  actual: number;
}): CoverageStatus {
  if (opts.isSynthetic) return "demo";
  if (opts.actual === 0) return "unavailable";
  if (opts.ok && opts.gaps === 0) return "complete";
  if (opts.ok) return "partial";
  return "unavailable";
}

/** Human summary rendered by the provenance badge / panel. */
export function describeProvenance(p: Partial<SessionProvenance> | null | undefined): string {
  if (!hasProvenance(p)) return LEGACY_PROVENANCE_LABEL;
  const bits = [p!.source_provider!];
  if (p!.source_type) bits.push(p!.source_type);
  if (p!.candle_count != null) bits.push(`${p!.candle_count} candles`);
  if (p!.coverage_status) bits.push(p!.coverage_status);
  return bits.join(" · ");
}
