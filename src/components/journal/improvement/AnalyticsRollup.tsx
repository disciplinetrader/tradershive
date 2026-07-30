/**
 * JOURNAL X — PHASE 5 · Replay improvement roll-up for Journal Analytics.
 *
 * A dedicated area inside the existing analytics page: the nine-dimension
 * profile, what practice fixed, which drills work, where it transfers, and
 * the homework queue driving the next session.
 */
import type { JournalEntry } from "@/lib/journal/api";
import type { HomeworkRow } from "@/lib/journal/homework";
import type { Rollup } from "@/lib/journal/improvement";
import { CONFIDENCE_LABEL, signed } from "@/lib/journal/improvement";
import { Delta, EvidencePill, InlineEmpty, Panel, Sparkline, Stat } from "./primitives";
import { DrillEffectiveness, MistakeRecurrence, SkillProfile } from "./SkillPanels";
import { ConsistencyPanel, GroupTable, RulePanel, SetupImprovement, TransferPanel } from "./GroupPanels";
import { NextDrillCard } from "./NextDrillCard";
import { HomeworkQueue } from "./HomeworkQueue";

export function AnalyticsRollup({
  rollup,
  entries,
  homework,
}: {
  rollup: Rollup;
  entries: JournalEntry[];
  homework: HomeworkRow[];
}) {
  const o = rollup.overview;

  return (
    <section id="replay-improvement" className="scroll-mt-20 space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Replay improvement</h2>
          <p className="text-[11px] text-muted-foreground">
            Long-term skill progression from replay practice. Process is the measure; outcome is context.
          </p>
        </div>
        <EvidencePill evidence={o.evidence} />
      </header>

      {o.completed === 0 ? (
        <Panel title="Process delta over time">
          <InlineEmpty text="No completed replay attempts yet. Once you replay a traded setup, this area tracks whether your execution process is actually improving — separately from whether the trade made money." />
        </Panel>
      ) : (
        <>
          <Panel title="Process delta over time" subtitle="Each point is one completed attempt">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                {o.series.length >= 3 ? (
                  <Sparkline points={o.series.map((p) => p.delta)} height={44} />
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Trend needs three measurable attempts — {o.series.length} so far.
                  </p>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Mean {signed(o.avgProcessDelta, 1)} across {o.completed} attempts · {CONFIDENCE_LABEL[o.evidence.level].toLowerCase()}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Attempts" value={o.attempts} hint={`${o.completed} completed`} />
                <Stat label="Avg process Δ" value={<Delta value={o.avgProcessDelta} digits={1} />} />
                <Stat label="Per week" value={o.attemptsPerWeek ?? "—"} />
                <Stat label="Improving" value={o.improving.length} hint={o.improving.map((s) => s.label).join(", ") || undefined} />
                <Stat label="Declining" value={o.declining.length} hint={o.declining.map((s) => s.label).join(", ") || undefined} />
                <Stat label="Best drill" value={o.currentDrill?.label ?? "—"} />
              </div>
            </div>
          </Panel>

          <SkillProfile rows={rollup.skills} />
          <MistakeRecurrence rows={rollup.mistakes} />
          <DrillEffectiveness rows={rollup.drills} />
          <SetupImprovement rows={rollup.setups} />

          <div className="grid gap-3 lg:grid-cols-2">
            <GroupTable
              title="By session"
              subtitle="Where practice moves the needle"
              rows={rollup.sessions}
              emptyText="No session tagged on the replayed trades yet."
            />
            <GroupTable
              title="By symbol"
              rows={rollup.symbols}
              emptyText="No symbol data on the replayed trades yet."
            />
            <GroupTable
              title="By playbook"
              rows={rollup.playbooks}
              emptyText="Attach a playbook to your trades to compare practice across strategies."
            />
            <GroupTable
              title="By target mistake"
              rows={rollup.byMistake}
              emptyText="No drill has targeted a specific mistake yet."
            />
          </div>

          <TransferPanel rows={rollup.transfer} />
          <ConsistencyPanel c={rollup.consistency} />
          <RulePanel rows={rollup.rules} />
        </>
      )}

      <Panel title="What to practise next" subtitle="Deterministic ranking — frequency, cost, recurrence, recency and mastery">
        <NextDrillCard recommendations={rollup.recommendations} entries={entries} />
      </Panel>

      <HomeworkQueue rows={homework} entries={entries} rollup={rollup} />
    </section>
  );
}
