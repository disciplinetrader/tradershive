/**
 * Impact as visual weight, shared by every surface that shows an event.
 *
 * Lives here rather than beside either consumer because both the market
 * calendar page and Replay Studio's chart popover render it, and neither owns
 * the other — `components/market` importing into `components/replay` (or the
 * reverse) would be a dependency in the wrong direction between two unrelated
 * areas.
 *
 * ── Why a dot ramp and not a count of red circles ──────────────────────────
 *
 * A filled / half / hollow ramp survives greyscale and colour-vision
 * deficiency, where "how many red things are there" does not. The colours stay
 * in `StudioChart`'s existing vocabulary — high is `destructive`, the token its
 * high-impact chart markers already use — so a marker and its popover agree on
 * what "high" looks like.
 */
import type { NewsImpact } from "@/lib/economic-calendar/types";
import { cn } from "@/lib/utils";

export function ImpactDots({ impact, className }: { impact: NewsImpact; className?: string }) {
  const filled = impact === "high" ? 3 : impact === "medium" ? 2 : impact === "low" ? 1 : 0;
  const tone =
    impact === "high" ? "bg-destructive" :
    impact === "medium" ? "bg-warning" :
    impact === "low" ? "bg-muted-foreground" : "bg-primary";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      title={`${impact} impact`}
      aria-label={`${impact} impact`}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < filled ? tone : "bg-border")} />
      ))}
    </span>
  );
}
