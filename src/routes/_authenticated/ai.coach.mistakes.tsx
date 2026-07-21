import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { listReplayMistakes } from "@/lib/replay-coach.functions";

export const Route = createFileRoute("/_authenticated/ai/coach/mistakes")({
  component: MistakesPage,
});

const KIND_LABEL: Record<string, string> = {
  no_sl: "No Stop-Loss",
  poor_rm: "Poor Risk Management",
  moved_sl: "Moved Stop-Loss",
  held_loser: "Held Loser Too Long",
  closed_winner_early: "Closed Winner Too Early",
  poor_rr: "Poor R:R",
  overtrading: "Overtrading",
  revenge: "Revenge Trading",
  fomo: "FOMO Entry",
  ignored_trend: "Ignored Trend",
  entered_early: "Entered Too Early",
  entered_late: "Entered Too Late",
  broke_objective: "Broke Objective",
};

function MistakesPage() {
  const list = useServerFn(listReplayMistakes);
  const q = useQuery({ queryKey: ["coach", "mistakes"], queryFn: () => list({ data: { limit: 500 } }) });
  const rows: any[] = (q.data as any) ?? [];

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  const totalCount = rows.length;
  const sortedKinds = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Mistake Frequency</div>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </div>
        <div className="text-3xl font-bold tabular-nums">{totalCount}</div>
        <div className="text-[11px] text-muted-foreground">last 200 detections</div>
        <ul className="space-y-1.5 pt-2">
          {sortedKinds.map(([k, c]) => (
            <li key={k}>
              <div className="flex justify-between text-[11px]">
                <span>{KIND_LABEL[k] ?? k}</span>
                <span className="tabular-nums">{c}</span>
              </div>
              <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
                <div className="h-full bg-danger" style={{ width: `${(c / max) * 100}%` }} />
              </div>
            </li>
          ))}
          {sortedKinds.length === 0 ? <li className="text-xs text-muted-foreground">No mistakes detected yet.</li> : null}
        </ul>
      </GlassCard>

      <GlassCard className="p-5 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Mistake Ledger</div>
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-2 py-2">Kind</th>
                <th className="text-left px-2 py-2">Severity</th>
                <th className="text-left px-2 py-2">Evidence</th>
                <th className="text-left px-2 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="px-2 py-1.5">{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className="px-2 py-1.5">
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${r.severity === "high" ? "bg-danger/20 text-danger" : r.severity === "med" ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-[280px]">
                    {JSON.stringify(r.evidence)}
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{new Date(r.detected_at).toLocaleString()}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="px-2 py-4 text-center text-xs text-muted-foreground">Clean sheet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
