/**
 * JOURNAL X — PHASE 5 · Setup improvement, live transfer, consistency,
 * grouped roll-ups and interim rule intelligence.
 */
import { cn } from "@/lib/utils";
import type { Consistency, GroupRow, RuleRow, SetupRow, TransferRow } from "@/lib/journal/improvement";
import { pct } from "@/lib/journal/improvement";
import { Delta, EvidencePill, InlineEmpty, Panel, Stat } from "./primitives";

/* ------------------------------------------------------------------ */
/* 2 · Grouped improvement (setup / playbook / session / symbol / …)   */
/* ------------------------------------------------------------------ */

export function GroupTable({
  title,
  subtitle,
  rows,
  emptyText,
  unit = "attempts",
}: {
  title: string;
  subtitle?: string;
  rows: GroupRow[];
  emptyText: string;
  unit?: string;
}) {
  if (!rows.length) {
    return (
      <Panel title={title} subtitle={subtitle}>
        <InlineEmpty text={emptyText} />
      </Panel>
    );
  }
  return (
    <Panel title={title} subtitle={subtitle}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2 text-left font-normal">Group</th>
            <th className="py-1.5 pr-2 text-right font-normal">n</th>
            <th className="py-1.5 pr-2 text-right font-normal">Process Δ</th>
            <th className="py-1.5 pr-2 text-right font-normal">Plan Δ</th>
            <th className="py-1.5 pr-2 text-right font-normal">Risk Δ</th>
            <th className="py-1.5 text-left font-normal">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/30 last:border-0">
              <td className="py-1.5 pr-2 truncate">{r.label}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground" title={`${r.attempts} ${unit}`}>
                {r.attempts}
              </td>
              <td className="py-1.5 pr-2 text-right">
                {r.attempts < 2 ? <span className="text-[11px] text-muted-foreground">—</span> : <Delta value={r.avgProcessDelta} digits={1} />}
              </td>
              <td className="py-1.5 pr-2 text-right">
                <Delta value={r.planDelta} digits={1} />
              </td>
              <td className="py-1.5 pr-2 text-right">
                <Delta value={r.riskDelta} digits={1} />
              </td>
              <td className="py-1.5">
                <EvidencePill evidence={r.evidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted-foreground">A delta is only shown once a group has two or more measurable attempts.</p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Setup improvement                                               */
/* ------------------------------------------------------------------ */

const FLAG_CLASS: Record<string, string> = {
  results_good_process_weak: "border-amber-500/30 text-amber-400/90",
  results_weak_process_improving: "border-sky-500/30 text-sky-400/90",
  no_transfer: "border-rose-500/30 text-rose-400/90",
};

const FLAG_LABEL: Record<string, string> = {
  results_good_process_weak: "Results ahead of process",
  results_weak_process_improving: "Process improving, results lagging",
  no_transfer: "Practice not transferring",
};

export function SetupImprovement({ rows }: { rows: SetupRow[] }) {
  if (!rows.length) {
    return (
      <Panel title="Setup improvement" subtitle="Which setups respond to practice">
        <InlineEmpty text="No setup has been replayed yet. Tag a setup on your trades, then replay one to compare live execution with practice." />
      </Panel>
    );
  }
  return (
    <Panel title="Setup improvement" subtitle="Live trades versus what practice changed, per setup">
      <div className="space-y-1.5">
        {rows.map((s) => (
          <div key={s.key} className="rounded-[3px] border border-border/50 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium">{s.label}</span>
              <EvidencePill evidence={s.evidence} />
              {s.flag ? (
                <span className={cn("rounded-[3px] border px-1 py-px text-[9px] uppercase tracking-wide", FLAG_CLASS[s.flag])}>
                  {FLAG_LABEL[s.flag]}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <Stat label="Live trades" value={s.originalTrades} />
              <Stat label="Attempts" value={s.attempts} />
              <Stat label="Process Δ" value={s.attempts < 2 ? "—" : <Delta value={s.avgProcessDelta} digits={1} />} />
              <Stat label="Plan Δ" value={<Delta value={s.planDelta} digits={1} />} />
              <Stat label="Risk Δ" value={<Delta value={s.riskDelta} digits={1} />} />
              <Stat label="Win rate" value={s.winRate == null ? "—" : pct(s.winRate)} hint="outcome context only" />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>Most common mistake: {s.commonMistake ?? "none tagged"}</span>
              <span>Most corrected: {s.correctedMistake ?? "none yet"}</span>
              <span>Best drill: {s.bestDrill ?? "no drill has proven itself yet"}</span>
            </div>
            {s.flagNote ? <p className="mt-1 text-[11px] text-muted-foreground">{s.flagNote}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 7 · Live-to-replay transfer                                         */
/* ------------------------------------------------------------------ */

export function TransferPanel({ rows }: { rows: TransferRow[] }) {
  if (!rows.length) {
    return (
      <Panel title="Live transfer" subtitle="Does practice show up in real trades?">
        <InlineEmpty text="No drill with a target mistake has been completed yet, so there is nothing to look for in later trades." />
      </Panel>
    );
  }
  return (
    <Panel title="Live transfer" subtitle="Rule-matched comparison of trades logged after each drill — correlation, never causation">
      <div className="space-y-1.5">
        {rows.map((t) => (
          <div key={t.key} className="rounded-[3px] border border-border/50 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium">{t.label}</span>
              <span
                className={cn(
                  "rounded-[3px] border px-1 py-px text-[9px] uppercase tracking-wide",
                  t.verdict === "observed" ? "border-emerald-500/30 text-emerald-400/90" : "border-border/60 text-muted-foreground",
                )}
              >
                {t.verdict === "observed" ? "Improvement observed" : t.verdict === "none" ? "No transfer detected yet" : "Not enough trades yet"}
              </span>
              <EvidencePill evidence={t.evidence} />
              <span className="ml-auto text-[10px] text-muted-foreground">
                practised {new Date(t.practisedAt).toISOString().slice(0, 10)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t.note}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
              <span>Comparable before {t.comparableBefore}</span>
              <span>after {t.comparableAfter}</span>
              <span>Mistake rate {t.rateBefore == null ? "—" : pct(t.rateBefore)} → {t.rateAfter == null ? "—" : pct(t.rateAfter)}</span>
              <span>Process {t.processBefore ?? "—"} → {t.processAfter ?? "—"}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Matching is rule-based only: same setup, same mistake category, trades logged within 60 days after the drill.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 8 · Practice consistency                                            */
/* ------------------------------------------------------------------ */

export function ConsistencyPanel({ c }: { c: Consistency }) {
  const max = Math.max(1, ...c.perWeek.map((w) => w.attempts));
  return (
    <Panel title="Practice consistency" subtitle="Shown because irregular practice makes every other number harder to read">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div>
          <div className="flex h-14 items-end gap-1">
            {c.perWeek.map((w) => (
              <div key={w.week} className="flex-1" title={`${w.week}: ${w.attempts} attempts, ${w.completed} completed`}>
                <div className="w-full rounded-[2px] bg-primary/40" style={{ height: `${(w.attempts / max) * 100}%`, minHeight: w.attempts ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Attempts per week, last {c.perWeek.length} weeks</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Per week" value={c.attemptsPerWeek ?? "—"} />
          <Stat label="Completed" value={c.completed} hint={`${c.abandoned} abandoned · ${c.inProgress} open`} />
          <Stat label="Completion" value={c.completionRate == null ? "—" : pct(c.completionRate)} />
          <Stat label="Repeated drills" value={c.repeatedDrills} hint="trades practised more than once" />
          <Stat label="Mistake → practice" value={c.medianDaysMistakeToPractice == null ? "—" : `${c.medianDaysMistakeToPractice}d`} hint="median" />
          <Stat label="Between attempts" value={c.medianDaysBetweenAttempts == null ? "—" : `${c.medianDaysBetweenAttempts}d`} hint="median" />
          <Stat label="Reflection done" value={c.reflectionRate == null ? "—" : pct(c.reflectionRate)} />
          <Stat label="Next action done" value={c.nextActionRate == null ? "—" : pct(c.nextActionRate)} hint="accepted homework" />
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 12 · Rule intelligence (interim)                                    */
/* ------------------------------------------------------------------ */

export function RulePanel({ rows }: { rows: RuleRow[] }) {
  if (!rows.length) {
    return (
      <Panel title="Rule adherence" subtitle="Preparation for per-rule expectancy">
        <InlineEmpty text="No checklist rules have been broken in your logged trades — or no checklist is attached to them yet. Create a playbook checklist to make rules measurable." />
      </Panel>
    );
  }
  return (
    <Panel title="Rule adherence" subtitle="Interim view from trade checklists — a full per-rule model arrives with playbook intelligence">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2 text-left font-normal">Rule</th>
            <th className="py-1.5 pr-2 text-right font-normal">Broken</th>
            <th className="py-1.5 pr-2 text-right font-normal">Adherence</th>
            <th className="py-1.5 pr-2 text-right font-normal">Corrected in replay</th>
            <th className="py-1.5 text-left font-normal">Setups</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border/30 last:border-0">
              <td className="py-1.5 pr-2 truncate">{r.label}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{r.broken}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{r.adherence == null ? "—" : `${r.adherence}%`}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                {r.corrected} / {r.corrected + r.repeated}
              </td>
              <td className="py-1.5 text-[10px] text-muted-foreground">{r.setups.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
