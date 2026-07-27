import { Lightbulb, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GoalProgress } from "@/lib/goals/types";

const ICONS = {
  on_track: { Icon: CheckCircle2, tone: "text-success" },
  completed: { Icon: CheckCircle2, tone: "text-success" },
  warning: { Icon: AlertTriangle, tone: "text-warning" },
  missed: { Icon: XCircle, tone: "text-danger" },
} as const;

export function GoalsInsights({ progress }: { progress: GoalProgress[] }) {
  if (!progress.length) return null;

  // Prioritise critical / warning insights first, then wins.
  const order = { missed: 0, warning: 1, on_track: 2, completed: 3 } as const;
  const sorted = [...progress].sort((a, b) => order[a.status] - order[b.status]).slice(0, 6);

  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5" /> Insights
      </div>
      <ul className="space-y-1.5">
        {sorted.map((p) => {
          const { Icon, tone } = ICONS[p.status];
          return (
            <li key={p.goal.id} className="flex items-start gap-2 text-sm">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} />
              <span className="text-foreground/90">{p.insight}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
