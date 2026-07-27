import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Plus, Target, Filter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createUserGoal,
  deleteUserGoal,
  getGoalsWithProgress,
  updateUserGoal,
} from "@/lib/goals.functions";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalDialog, type GoalDraft } from "@/components/goals/GoalDialog";
import { GoalsInsights } from "@/components/goals/GoalsInsights";
import type { GoalProgress, GoalRow } from "@/lib/goals/types";
import { GOAL_META } from "@/lib/goals/types";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({
    meta: [
      { title: "Goals & Progress — TradersHIVE Arena" },
      { name: "description", content: "Define personal trading goals and track your discipline, performance and practice over time." },
      { property: "og:title", content: "Goals & Progress — TradersHIVE Arena" },
      { property: "og:description", content: "Track measurable trading progress: daily R targets, journaling rate, replay hours and more." },
    ],
  }),
  component: GoalsPage,
});

type Filter = "all" | "discipline" | "performance" | "practice";

function GoalsPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getGoalsWithProgress);
  const createFn = useServerFn(createUserGoal);
  const updateFn = useServerFn(updateUserGoal);
  const deleteFn = useServerFn(deleteUserGoal);

  const q = useQuery({ queryKey: ["goals", "progress"], queryFn: () => fetchFn(), staleTime: 30_000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["goals", "progress"] });

  const create = useMutation({
    mutationFn: (d: GoalDraft) => createFn({ data: d }),
    onSuccess: () => { toast.success("Goal created"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (v: { id: string } & Partial<GoalDraft>) => updateFn({ data: v as any }),
    onSuccess: () => { toast.success("Goal updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Goal deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GoalRow | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const items: GoalProgress[] = q.data?.progress ?? [];
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((p) => GOAL_META[p.goal.kind].category === filter);
  }, [items, filter]);

  const summary = useMemo(() => {
    const total = items.length;
    const completed = items.filter((p) => p.status === "completed").length;
    const attention = items.filter((p) => p.status === "warning" || p.status === "missed").length;
    return { total, completed, attention };
  }, [items]);

  function handleSubmit(d: GoalDraft) {
    if (editing) update.mutate({ id: editing.id, ...d });
    else create.mutate(d);
    setDialogOpen(false);
    setEditing(null);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
            <Target className="h-3.5 w-3.5" /> Trading discipline
          </div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Goals &amp; Progress</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Define personal targets for discipline, performance and practice. Progress is computed live from your paper trades, journal entries and replay sessions.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="self-start sm:self-auto">
          <Plus className="mr-1.5 h-4 w-4" /> New goal
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Active goals" value={summary.total} tone="default" />
        <SummaryCard label="Completed" value={summary.completed} tone="success" />
        <SummaryCard label="Need attention" value={summary.attention} tone="warning" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="discipline">Discipline</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Grid + insights */}
      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={() => { setEditing(null); setDialogOpen(true); }} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((p) => (
              <GoalCard
                key={p.goal.id}
                progress={p}
                onEdit={() => { setEditing(p.goal); setDialogOpen(true); }}
                onDelete={() => del.mutate(p.goal.id)}
              />
            ))}
          </div>
          <div className="space-y-3">
            <GoalsInsights progress={items} />
            <div className="rounded-2xl border border-border/40 bg-card/40 p-4 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">How progress is measured</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Performance goals use <strong>R</strong> from paper &amp; journal trades.</li>
                <li>Discipline caps show <em>used</em> vs. limit — lower is better.</li>
                <li>Practice goals aggregate replay time &amp; journal entries.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <GoalDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSubmit={handleSubmit}
      />
    </motion.div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "default" | "success" | "warning" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Target className="h-6 w-6" /></div>
      <div>
        <h2 className="text-lg font-semibold">No goals yet</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Traders who define measurable targets improve faster. Start with a daily R target or a max-loss cap to build discipline.
        </p>
      </div>
      <Button onClick={onCreate}><Plus className="mr-1.5 h-4 w-4" /> Create your first goal</Button>
    </div>
  );
}
