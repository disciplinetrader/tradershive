import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EngineInsight } from "@/lib/mistakes/types";

export function InsightList({ insights }: { insights: EngineInsight[] }) {
  if (!insights.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        Not enough data yet. Log more trades to unlock personalised insights.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {insights.map((i) => {
        const Icon = i.tone === "warn" ? AlertTriangle : i.tone === "positive" ? CheckCircle2 : Info;
        const cls =
          i.tone === "warn" ? "border-warning/30 bg-warning/5 text-warning"
          : i.tone === "positive" ? "border-success/30 bg-success/5 text-success"
          : "border-primary/30 bg-primary/5 text-primary";
        return (
          <li key={i.id} className={cn("flex items-start gap-3 rounded-lg border p-3", cls)}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm leading-relaxed text-foreground">{i.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function InsightHint() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Sparkles className="h-3 w-3" /> Rule-based insights. AI coaching consumes the same signals.
    </div>
  );
}
