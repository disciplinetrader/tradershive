/**
 * Plan vs Reality — side-by-side comparison with a transparent adherence
 * score. Every verdict carries the rule that produced it.
 */
import type { PlanRow } from "@/lib/journal/story";
import { Bar, MissingData, VerdictPill } from "./primitives";

export function PlanVsReality({ rows, adherence }: { rows: PlanRow[]; adherence: number | null }) {
  if (!rows.length) return <MissingData label="Nothing to compare yet — add a plan to this trade." />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Plan adherence</span>
            <span className="text-sm font-semibold tabular-nums">{adherence == null ? "—" : `${adherence}%`}</span>
          </div>
          <div className="mt-1">
            <Bar pct={adherence ?? 0} tone={adherence == null ? "primary" : adherence >= 75 ? "up" : adherence >= 50 ? "primary" : "down"} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Followed = 1, minor deviation = 0.6, major = 0. Areas with missing data are excluded from the score.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border/50">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border/50 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">Area</th>
              <th className="px-2 py-1.5 text-left font-medium">Planned</th>
              <th className="px-2 py-1.5 text-left font-medium">Actual</th>
              <th className="px-2 py-1.5 text-right font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-0 align-top">
                <td className="px-2 py-1.5 font-medium text-foreground">{r.area}</td>
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.planned}</td>
                <td className="px-2 py-1.5 tabular-nums text-foreground">{r.actual}</td>
                <td className="px-2 py-1.5 text-right">
                  <VerdictPill verdict={r.verdict} />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{r.why}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
