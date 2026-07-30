/**
 * AI review — reads the stored `ai_review` payload when one exists and
 * otherwise renders a grounded, rule-derived read of the trade. Every claim
 * points at data we actually have; missing evidence is stated as missing.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ThumbsDown, ThumbsUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JournalEntry } from "@/lib/journal/api";
import type { MistakeItem, StoryMetrics } from "@/lib/journal/story";
import { formatNumber } from "@/lib/journal/format";

type Block = { title: string; body: string };

export function AiReview({
  entry,
  metrics,
  mistakes,
  adherence,
  onAddToNotes,
}: {
  entry: JournalEntry;
  metrics: StoryMetrics;
  mistakes: MistakeItem[];
  adherence: number | null;
  onAddToNotes: (text: string) => void;
}) {
  const [feedback, setFeedback] = useState<"helpful" | "incorrect" | null>(null);

  const stored = (entry.ai_review ?? null) as { summary?: string; execution?: string; risk_management?: string; psychology?: string } | null;

  const blocks = useMemo<Block[]>(() => {
    const gaps: string[] = [];
    if (metrics.mfe == null) gaps.push("chart history for MFE/MAE");
    if (metrics.riskPct == null) gaps.push("recorded risk %");
    if (!(entry.emotions ?? []).length) gaps.push("psychology tags");
    if (!entry.setup) gaps.push("a setup label");

    const out: Block[] = [
      {
        title: "Executive summary",
        body:
          stored?.summary ??
          `${entry.symbol ?? "This trade"} closed at ${metrics.r == null ? "an unrecorded R" : `${formatNumber(metrics.r, 2)}R`}` +
            `${metrics.netPnl == null ? "" : ` (${metrics.netPnl >= 0 ? "+" : ""}${formatNumber(metrics.netPnl, 2)})`}` +
            `${adherence == null ? "." : ` with ${adherence}% plan adherence.`}`,
      },
      {
        title: "Done well",
        body:
          metrics.riskPct != null && metrics.riskPct <= 2
            ? `Risk stayed at ${formatNumber(metrics.riskPct, 2)}% — inside a sane per-trade budget.`
            : entry.stop_loss != null
            ? "A stop level was defined and stored with the trade."
            : "Not enough recorded data to credit a specific strength.",
      },
      {
        title: "Most important mistake",
        body: mistakes.length
          ? `${mistakes[0].label} — ${mistakes[0].evidence ?? "tagged on this trade"}. Instead: ${mistakes[0].correct}`
          : "No mistake is tagged or rule-detected on this trade.",
      },
      {
        title: "Risk review",
        body: stored?.risk_management ??
          (metrics.riskDistance == null
            ? "No stop distance recorded, so risk cannot be reviewed."
            : `Stop distance ${formatNumber(metrics.riskDistance, 5)}${metrics.plannedRR == null ? "" : `, planned ${formatNumber(metrics.plannedRR, 2)}R`}.`),
      },
      {
        title: "Execution review",
        body: stored?.execution ??
          (metrics.entryEfficiency == null
            ? "Entry and exit efficiency need chart history for this window."
            : `Entry efficiency ${Math.round(metrics.entryEfficiency)}%, exit efficiency ${metrics.exitEfficiency == null ? "—" : `${Math.round(metrics.exitEfficiency)}%`}.`),
      },
      {
        title: "Rule review",
        body: adherence == null ? "No plan fields recorded, so adherence is unscored." : `Plan adherence scored ${adherence}% from the recorded plan fields.`,
      },
      {
        title: "Psychology review",
        body: stored?.psychology ??
          ((entry.emotions ?? []).length
            ? `States associated with this trade: ${(entry.emotions ?? []).join(", ")}. Association only — not a proven cause.`
            : "No psychology captured for this trade."),
      },
      {
        title: "One improvement action",
        body: mistakes[0]?.correct ?? "Write the stop, target and invalidation before the next entry.",
      },
    ];
    if (gaps.length) out.push({ title: "Missing evidence", body: `This read is limited by: ${gaps.join(", ")}.` });
    return out;
  }, [entry, metrics, mistakes, adherence, stored]);

  return (
    <div className="space-y-2">
      {blocks.map((b) => (
        <div key={b.title} className="rounded border border-border/40 px-2 py-1.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{b.title}</p>
              <p className="text-[12px] leading-relaxed text-foreground/90">{b.body}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 shrink-0 px-1 text-muted-foreground"
              title="Add to notes"
              onClick={() => { onAddToNotes(`${b.title}: ${b.body}`); toast.success("Added to your notes"); }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] text-muted-foreground">Was this useful?</span>
        <Button
          variant={feedback === "helpful" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setFeedback("helpful"); toast.success("Thanks — noted."); }}
        >
          <ThumbsUp className="mr-1 h-3 w-3" /> Helpful
        </Button>
        <Button
          variant={feedback === "incorrect" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setFeedback("incorrect"); toast.message("Flagged as incorrect — it won't be treated as fact."); }}
        >
          <ThumbsDown className="mr-1 h-3 w-3" /> Incorrect
        </Button>
      </div>
    </div>
  );
}
