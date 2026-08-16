/**
 * Coarse session buckets for statistics grouping.
 *
 * A four-value view of the canonical rule in `@/lib/market-sessions`, kept
 * because the statistics surfaces group on these four and nothing else. The
 * hours are NOT defined here any more — this module used to carry its own
 * fixed-UTC windows (london 07-12, NY 12-21) which were a third disagreeing
 * definition and, like the others, an hour out for half the year.
 */
import { sessionAt } from "@/lib/market-sessions";

export function inferSession(iso: string): "asia" | "london" | "new_york" | "other" {
  switch (sessionAt(iso)) {
    case "london":
      return "london";
    // The overlap groups with New York, matching what the old windows did:
    // 12:00-16:00 UTC fell into this module's `new_york` bucket.
    case "london_ny_overlap":
    case "new_york":
      return "new_york";
    // Sydney now reports as Asia rather than "other". The old rule had no
    // Sydney window at all, so its hours fell through to "other" — grouping a
    // real Asian session under a bucket named for having no session.
    case "tokyo":
    case "sydney":
      return "asia";
    default:
      return "other";
  }
}

export const SESSION_LABEL: Record<string, string> = {
  asia: "Asia",
  london: "London",
  new_york: "New York",
  other: "Other / Off-hours",
};
