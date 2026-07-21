import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { generateCoachReport, listCoachReports } from "@/lib/replay-coach.functions";

export const Route = createFileRoute("/_authenticated/ai/coach/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCoachReports);
  const gen = useServerFn(generateCoachReport);
  const q = useQuery({ queryKey: ["coach", "reports"], queryFn: () => list() });
  const m = useMutation({
    mutationFn: (period: "weekly" | "monthly") => gen({ data: { period } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach", "reports"] }),
  });
  const rows: any[] = (q.data as any) ?? [];

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Coaching Reports</div>
          <div className="text-lg font-bold">Weekly & monthly progress</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => m.mutate("weekly")} disabled={m.isPending}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Weekly
          </Button>
          <Button size="sm" onClick={() => m.mutate("monthly")} disabled={m.isPending}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Monthly
          </Button>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <GlassCard key={r.id} className="p-5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold capitalize">{r.period} · {r.period_start} → {r.period_end}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Sessions" v={r.stats?.sessions_count ?? 0} />
              <Stat label="Trades" v={r.stats?.trades_count ?? 0} />
              <Stat label="Win Rate" v={`${r.stats?.win_rate ?? 0}%`} />
              <Stat label="Avg Score" v={r.stats?.avg_score ?? 0} />
            </div>
            <Section title="Biggest Improvement">{r.biggest_improvement}</Section>
            <Section title="Biggest Weakness">{r.biggest_weakness}</Section>
            <Section title="Homework Recommendation">{r.homework_recommendation}</Section>
            <Section title="Next Focus">{r.next_focus}</Section>
            {r.body?.narrative ? (
              <p className="text-xs text-foreground/90 pt-1">{r.body.narrative}</p>
            ) : null}
          </GlassCard>
        ))}
        {rows.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-muted-foreground md:col-span-2">
            No reports yet. Generate one above.
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-border/60 bg-background/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{v}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <p className="text-xs text-foreground/90">{children}</p>
    </div>
  );
}
