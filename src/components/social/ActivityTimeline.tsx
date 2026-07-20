import { formatDistanceToNow } from "date-fns";
import { Award, LineChart, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { kind: string; at: string; title: string; sub?: string; icon?: string | null; value?: number | null };

const ICONS: Record<string, any> = {
  xp: Zap,
  achievement: Award,
  trade: LineChart,
  challenge: Sparkles,
};

export function ActivityTimeline({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No recent activity.</p>;
  }
  return (
    <ol className="relative ml-3 border-l border-border/60">
      {items.map((it, i) => {
        const Icon = ICONS[it.kind] ?? Sparkles;
        return (
          <li key={i} className="relative pb-4 pl-6">
            <span className="absolute -left-[9px] top-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-background text-primary">
              <Icon className="h-2.5 w-2.5" />
            </span>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{it.title}</div>
                {it.sub ? <div className="truncate text-xs text-muted-foreground">{it.sub}</div> : null}
              </div>
              <div className="shrink-0 text-right">
                {it.value != null ? (
                  <div className={cn("font-mono text-xs font-semibold", it.value > 0 ? "text-success" : it.value < 0 ? "text-danger" : "")}>
                    {it.value >= 0 ? "+" : ""}{it.value.toFixed(2)}
                  </div>
                ) : null}
                <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(it.at), { addSuffix: true })}</div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
