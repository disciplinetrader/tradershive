/** UTC-hour buckets for major FX sessions. */
export function inferSession(iso: string): "asia" | "london" | "new_york" | "other" {
  const h = new Date(iso).getUTCHours();
  // Asia: 00-08 UTC ; London: 07-16 UTC ; NY: 12-21 UTC — using primary hours
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 12) return "london";
  if (h >= 12 && h < 21) return "new_york";
  return "other";
}

export const SESSION_LABEL: Record<string, string> = {
  asia: "Asia",
  london: "London",
  new_york: "New York",
  other: "Other / Off-hours",
};
