/**
 * JOURNAL X — PHASE 5 · Improvement Intelligence on the Journal Overview.
 *
 * Deliberately compact: nine numbers, one recommendation, one link into the
 * deep roll-up. Everything is read from the shared `Rollup` so the Overview
 * can never disagree with Analytics.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JournalEntry } from "@/lib/journal/api";
import type { Rollup } from "@/lib/journal/improvement";
import { CONFIDENCE_LABEL, DRILL_VERDICT_LABEL, signed } from "@/lib/journal/improvement";
import { Delta, EvidencePill, InlineEmpty, Panel, Sparkline, Stat } from "./primitives";
import { NextDrillCard } from "./NextDrillCard";

export function IntelligencePanel({ rollup, entries }: { rollup: Rollup; entries: JournalEntry[] }) {
  const o = rollup.overview;

  if (o.attempts === 0) {
    return (
      <Panel title="Improvement intelligence" subtitle="Replay practice measured over time">
        <InlineEmpty
          text="No replay attempts yet. Replay one traded setup and this section starts tracking whether your process is actually improving."
          action={
            <Button asChild size="sm" variant="outline" className="h-6 px-2 text-[11px]">
              <Link to="/journal/trades">Pick a trade to replay</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const improving = o.improving.slice(0, 2);
  const declining = o.declining.slice(0, 2);

  return (
    <Panel
      title="Improvement intelligence"
      subtitle="Process progression from replay practice — outcome is context, not proof"
      actions={
        <div className="flex items-center gap-2">
          <EvidencePill evidence={o.evidence} />
          <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-muted-foreground">
            <Link to="/journal/analytics" hash="replay-improvement">
              Full roll-up <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Attempts" value={o.completed} hint={`${o.attempts} started`} />
            <Stat
              label="Avg process delta"
              value={<Delta value={o.avgProcessDelta} digits={1} />}
              hint={o.completed < 3 ? "Too few attempts for a trend" : "Mean across completed attempts"}
            />
            <Stat label="Practice rate" value={o.attemptsPerWeek ?? "—"} hint="attempts / week (8w)" />
            <Stat
              label="Skills improving"
              value={improving.length ? improving.map((s) => s.label).join(", ") : "None yet"}
              hint={improving.length ? improving.map((s) => `${signed(s.delta)} (n=${s.sample})`).join(" · ") : "Needs measurable attempts"}
            />
            <Stat
              label="Skills declining"
              value={declining.length ? declining.map((s) => s.label).join(", ") : "None"}
              hint={declining.length ? declining.map((s) => `${signed(s.delta)} (n=${s.sample})`).join(" · ") : undefined}
            />
            <Stat
              label="Sample"
              value={CONFIDENCE_LABEL[o.evidence.level]}
              hint={o.evidence.why}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Most corrected"
              value={o.mostCorrected?.label ?? "—"}
              hint={o.mostCorrected ? `${o.mostCorrected.corrected} corrected of ${o.mostCorrected.tests} tests` : "No corrections recorded yet"}
            />
            <Stat
              label="Most repeated"
              value={o.mostRepeated?.label ?? "—"}
              hint={o.mostRepeated ? `${o.mostRepeated.repeated} repeats of ${o.mostRepeated.tests} tests` : "No repeats recorded"}
            />
            <Stat
              label="Current drill"
              value={o.currentDrill?.label ?? "—"}
              hint={o.currentDrill ? `${DRILL_VERDICT_LABEL[o.currentDrill.verdict]} · n=${o.currentDrill.attempts}` : undefined}
            />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Process delta trend</div>
              {o.series.length >= 3 ? (
                <Sparkline points={o.series.map((p) => p.delta)} />
              ) : (
                <div className="pt-1 text-[10px] text-muted-foreground">
                  Trend hidden — {o.series.length} measurable attempt{o.series.length === 1 ? "" : "s"} (needs 3).
                </div>
              )}
            </div>
          </div>
        </div>

        <NextDrillCard recommendations={rollup.recommendations} entries={entries} compact />
      </div>
    </Panel>
  );
}
