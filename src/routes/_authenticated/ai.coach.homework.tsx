import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, PlayCircle, SkipForward, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { generateHomework, listHomework, updateHomeworkStatus } from "@/lib/replay-coach.functions";

export const Route = createFileRoute("/_authenticated/ai/coach/homework")({
  component: HomeworkPage,
});

function HomeworkPage() {
  const qc = useQueryClient();
  const list = useServerFn(listHomework);
  const gen = useServerFn(generateHomework);
  const upd = useServerFn(updateHomeworkStatus);
  const q = useQuery({ queryKey: ["coach", "homework"], queryFn: () => list() });
  const genM = useMutation({
    mutationFn: () => gen(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach", "homework"] }),
  });
  const updM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "completed" | "skipped" | "in_progress" }) =>
      upd({ data: { id, status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coach", "homework"] }),
  });
  const rows: any[] = (q.data as any) ?? [];

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Personalized Practice</div>
          <div className="text-lg font-bold">Coach-prescribed homework</div>
          <p className="text-xs text-muted-foreground">Generated from your weakest area and recent replay patterns.</p>
        </div>
        <Button onClick={() => genM.mutate()} disabled={genM.isPending}>
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          {genM.isPending ? "Generating…" : "New Homework"}
        </Button>
      </GlassCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((h) => (
          <GlassCard key={h.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{h.symbol} · {h.timeframe}</div>
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${h.status === "completed" ? "bg-success/20 text-success" : h.status === "in_progress" ? "bg-primary/20 text-primary" : h.status === "skipped" ? "bg-muted text-muted-foreground" : "bg-warning/20 text-warning"}`}>{h.status}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {h.market} · {h.session_hint ?? "any"} · {h.difficulty} · target {h.target_r}R · max {h.max_trades} trades
            </div>
            <p className="text-xs text-foreground/90">{h.reason}</p>
            {h.status !== "completed" && h.status !== "skipped" ? (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Button asChild size="sm" variant="secondary" onClick={() => updM.mutate({ id: h.id, status: "in_progress" })}>
                  <Link to="/replay"><PlayCircle className="mr-1 h-3.5 w-3.5" /> Start</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updM.mutate({ id: h.id, status: "completed" })}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Done
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updM.mutate({ id: h.id, status: "skipped" })}>
                  <SkipForward className="mr-1 h-3.5 w-3.5" /> Skip
                </Button>
              </div>
            ) : null}
          </GlassCard>
        ))}
        {rows.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
            No homework yet. Generate one to get started.
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}
