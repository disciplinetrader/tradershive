/**
 * JOURNAL X — PHASE 5 · Skill profile, mistake recurrence, drill effectiveness.
 *
 * All three read the shared roll-up. Missing dimensions render as
 * "Not measurable" — never as zero — and every row carries its sample size.
 */
import { cn } from "@/lib/utils";
import type { DrillRow, MistakeRecurrenceRow, SkillRow } from "@/lib/journal/improvement";
import { DRILL_VERDICT_LABEL, modeLabel, pct } from "@/lib/journal/improvement";
import { Delta, EvidencePill, InlineEmpty, Panel } from "./primitives";

/* ------------------------------------------------------------------ */
/* 3 · Nine-dimension skill profile                                    */
/* ------------------------------------------------------------------ */

export function SkillProfile({ rows }: { rows: SkillRow[] }) {
  const measurable = rows.filter((r) => r.sample > 0);
  return (
    <Panel
      title="Skill profile"
      subtitle="Rolling replay score per dimension against the previous period"
    >
      {measurable.length === 0 ? (
        <InlineEmpty text="No dimension has been measurable yet. Complete a replay attempt with a stop, a plan and a reflection to populate this profile." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-2 text-left font-normal">Dimension</th>
                <th className="py-1.5 pr-2 text-right font-normal">Current</th>
                <th className="py-1.5 pr-2 text-right font-normal">Previous</th>
                <th className="py-1.5 pr-2 text-right font-normal">Delta</th>
                <th className="py-1.5 pr-2 text-right font-normal">n</th>
                <th className="py-1.5 pr-2 text-left font-normal">Evidence</th>
                <th className="py-1.5 text-left font-normal">Recommended drill</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/30 align-top last:border-0">
                  <td className="py-1.5 pr-2" title={r.how}>
                    {r.label}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.current ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.previous ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {r.sample < 2 ? <span className="text-[11px] text-muted-foreground">—</span> : <Delta value={r.delta} threshold={4} />}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.sample}</td>
                  <td className="py-1.5 pr-2">
                    <div className="flex flex-col gap-0.5">
                      <EvidencePill evidence={r.evidence} className="self-start" />
                      {r.bestEvidence ? <span className="text-[10px] text-muted-foreground">{r.bestEvidence}</span> : null}
                    </div>
                  </td>
                  <td className="py-1.5 text-[10px] leading-snug text-muted-foreground">{r.drill}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Dimensions without data on an attempt are excluded from both periods rather than scored as zero, so adding a stop or a reflection
        changes the sample size — not the score.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · Mistake recurrence                                              */
/* ------------------------------------------------------------------ */

const SOURCE_LABEL = { user: "Tagged", rule: "Rule-detected", ai: "AI-suggested" } as const;

export function MistakeRecurrence({ rows }: { rows: MistakeRecurrenceRow[] }) {
  if (!rows.length) {
    return (
      <Panel title="Mistake recurrence" subtitle="Whether practice actually removes a mistake">
        <InlineEmpty text="No confirmed mistakes yet. Tag a mistake on a trade to make it trackable — AI suggestions stay unconfirmed until you accept them." />
      </Panel>
    );
  }
  return (
    <Panel title="Mistake recurrence" subtitle="Original occurrences versus what replay practice proved">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-2 text-left font-normal">Mistake</th>
              <th className="py-1.5 pr-2 text-left font-normal">Source</th>
              <th className="py-1.5 pr-2 text-right font-normal">Logged</th>
              <th className="py-1.5 pr-2 text-right font-normal">Tested</th>
              <th className="py-1.5 pr-2 text-right font-normal">Fixed</th>
              <th className="py-1.5 pr-2 text-right font-normal">Partial</th>
              <th className="py-1.5 pr-2 text-right font-normal">Repeated</th>
              <th className="py-1.5 pr-2 text-right font-normal">Untested</th>
              <th className="py-1.5 pr-2 text-right font-normal">Recurrence</th>
              <th className="py-1.5 pr-2 text-right font-normal">Process cost</th>
              <th className="py-1.5 text-left font-normal">Trend / setups</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.value} className="border-b border-border/30 align-top last:border-0">
                <td className="py-1.5 pr-2">
                  <div className="flex flex-col">
                    <span>{r.label}</span>
                    <EvidencePill evidence={r.evidence} className="mt-0.5 self-start" />
                  </div>
                </td>
                <td className="py-1.5 pr-2">
                  <span
                    className={cn(
                      "rounded-[3px] border px-1 py-px text-[9px] uppercase tracking-wide",
                      r.source === "ai" ? "border-amber-500/30 text-amber-400/90" : "border-border/60 text-muted-foreground",
                    )}
                    title={r.source === "ai" ? "Suggested by AI — not counted as confirmed until you tag it on the trade." : undefined}
                  >
                    {SOURCE_LABEL[r.source]}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.originalCount}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.tests}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-emerald-400/90">{r.corrected}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.partial}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-rose-400/90">{r.repeated}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.notTested}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.recurrenceRate == null ? "—" : pct(r.recurrenceRate)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {r.processCost == null ? "—" : <span className={r.processCost < 0 ? "text-rose-400/90" : "text-muted-foreground"}>{r.processCost}</span>}
                </td>
                <td className="py-1.5 text-[10px] leading-snug text-muted-foreground">
                  {r.trend === "unknown" ? "Trend needs 3 decided tests" : r.trend === "improving" ? "Improving" : r.trend === "worsening" ? "Worsening" : "Flat"}
                  {r.setups.length ? ` · ${r.setups.join(", ")}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Recurrence = (repeated + half of partial) ÷ decided tests. Process cost is the mean process-score gap between trades carrying this
        mistake and the rest of your measured trades.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 5 · Drill effectiveness                                             */
/* ------------------------------------------------------------------ */

const VERDICT_CLASS: Record<string, string> = {
  effective: "border-emerald-500/30 text-emerald-400/90",
  promising: "border-sky-500/30 text-sky-400/90",
  no_change: "border-border/60 text-muted-foreground",
  inconsistent: "border-amber-500/30 text-amber-400/90",
  insufficient: "border-border/60 text-muted-foreground",
};

export function DrillEffectiveness({ rows }: { rows: DrillRow[] }) {
  if (!rows.length) {
    return (
      <Panel title="Drill effectiveness" subtitle="Is the practice actually working?">
        <InlineEmpty text="No completed drills yet. A drill needs at least two attempts before it can be judged." />
      </Panel>
    );
  }
  return (
    <Panel title="Drill effectiveness" subtitle="Replay mode × target mistake — never judged on a single attempt">
      <div className="space-y-1.5">
        {rows.map((d) => (
          <div key={d.key} className="rounded-[3px] border border-border/50 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium">{d.label}</span>
              <span className={cn("rounded-[3px] border px-1 py-px text-[9px] uppercase tracking-wide", VERDICT_CLASS[d.verdict])}>
                {DRILL_VERDICT_LABEL[d.verdict]}
              </span>
              <EvidencePill evidence={d.evidence} />
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {modeLabel(d.mode)} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{d.why}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>
                Avg process delta <Delta value={d.avgProcessDelta} digits={1} />
              </span>
              <span>Corrected {d.corrected}</span>
              <span>Repeated {d.repeated}</span>
              <span>New mistakes {d.introduced}</span>
              <span>Consistency {d.consistency == null ? "—" : pct(d.consistency)}</span>
              <span>{d.outcomeIndependent ? "Process gain independent of P/L" : "Process gain not yet shown independently of P/L"}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
