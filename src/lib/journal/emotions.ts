/**
 * Emotion normalization — maps historical emotion values (from earlier
 * platform versions) onto the canonical 5-value catalog. Everything else
 * is bucketed as "unknown" until the user edits the trade.
 */

import { DEFAULT_EMOTIONS, type Option } from "./constants";

export const CANONICAL_EMOTIONS = new Set(DEFAULT_EMOTIONS.map((o) => o.value));

const LEGACY_MAP: Record<string, string> = {
  // dropped values → closest canonical
  confident: "disciplined",
  confidence: "disciplined",
  discipline: "disciplined",
  patient: "calm",
  patience: "calm",
  greed: "fomo",
  overconfident: "fomo",
  overconfidence: "fomo",
  impulsive: "revenge",
  impatience: "fomo",
  excited: "fomo",
};

export const UNKNOWN_EMOTION: Option = {
  value: "unknown",
  label: "❔ Unknown",
  emoji: "❔",
  color: "#a3a3a3",
};

export function mapLegacyEmotion(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (CANONICAL_EMOTIONS.has(v)) return v;
  if (LEGACY_MAP[v]) return LEGACY_MAP[v];
  return "unknown";
}

/** Normalize an array of raw emotion values → canonical set (deduped). */
export function normalizeEmotions(raw: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const r of raw) {
    if (!r) continue;
    out.add(mapLegacyEmotion(String(r)));
  }
  return Array.from(out);
}

export function emotionMeta(value: string): Option {
  const v = value.trim().toLowerCase();
  const found = DEFAULT_EMOTIONS.find((o) => o.value === v);
  if (found) return found;
  return { ...UNKNOWN_EMOTION };
}
