import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, TrendingUp, MoreVertical, Trash2, Pencil } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { GOAL_META, type GoalProgress } from "@/lib/goals/types";

type Props = {
  progress: GoalProgress;
  compact?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};

const STATUS_STYLES = {
  on_track: {
    ring: "ring-success/40 border-success/30",
    accent: "text-success",
    bg: "bg-success/10",
    label: "On track",
    Icon: TrendingUp,
  },
  completed: {
    ring: "ring-success/60 border-success/50",
    accent: "text-success",
    bg: "bg-success/15",
    label: "Completed",
    Icon: CheckCircle2,
  },
  warning: {
    ring: "ring-warning/40 border-warning/30",
    accent: "text-warning",
    bg: "bg-warning/10",
    label: "Needs attention",
    Icon: AlertTriangle,
  },
  missed: {
    ring: "ring-danger/40 border-danger/30",
    accent: "text-danger",
    bg: "bg-danger/10",
    label: "Missed",
    Icon: XCircle,
  },
} as const;

export function GoalCard({ progress, compact, onEdit, onDelete }: Props) {
  const meta = GOAL_META[progress.goal.kind];
  const s = STATUS_STYLES[progress.status];
  const Icon = s.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative rounded-2xl border bg-card/60 p-4 ring-1 backdrop-blur transition hover:bg-card/80",
        s.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider", s.bg, s.accent)}>
              <Icon className="h-3 w-3" />
              {s.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{progress.goal.period}</span>
          </div>
          <h3 className={cn("mt-2 truncate font-semibold", compact ? "text-sm" : "text-base")}>{progress.goal.name}</h3>
          {!compact && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{meta.label}</p>}
        </div>
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-70 hover:opacity-100"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
              {onDelete && <DropdownMenuItem className="text-danger focus:text-danger" onClick={onDelete}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className={cn("font-bold tabular-nums", compact ? "text-xl" : "text-2xl", s.accent)}>
          {progress.formattedCurrent}
        </div>
        <div className="text-xs text-muted-foreground">
          {meta.direction === "down" ? "≤ " : "of "}{progress.formattedTarget}
        </div>
      </div>

      <Progress value={progress.pct} className={cn("mt-2 h-1.5", meta.direction === "down" && "[&>div]:bg-warning", progress.status === "completed" && "[&>div]:bg-success", progress.status === "missed" && "[&>div]:bg-danger")} />
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{progress.pct.toFixed(0)}% {meta.direction === "down" ? "used" : "complete"}</span>
        {!compact && <span className="line-clamp-1 text-right italic">{progress.insight}</span>}
      </div>
    </motion.div>
  );
}
