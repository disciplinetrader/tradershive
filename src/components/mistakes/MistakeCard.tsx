import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Minus, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RULES } from "@/lib/mistakes/engine";
import type { DetectedMistake } from "@/lib/mistakes/types";

const CAT_COLORS: Record<DetectedMistake["category"], string> = {
  risk: "border-destructive/30 bg-destructive/5 text-destructive",
  execution: "border-warning/30 bg-warning/5 text-warning",
  psychology: "border-primary/30 bg-primary/5 text-primary",
  discipline: "border-info/30 bg-info/5 text-info",
  consistency: "border-muted-foreground/30 bg-muted/20 text-muted-foreground",
};

const SEV_TONE: Record<DetectedMistake["severity"], string> = {
  low: "bg-muted/40 text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

export function MistakeCard({ mistake }: { mistake: DetectedMistake }) {
  const rule = RULES[mistake.kind];
  const catCls = CAT_COLORS[mistake.category];
  const impactTone = mistake.impact_r < 0 ? "text-destructive" : mistake.impact_r > 0 ? "text-success" : "text-muted-foreground";
  const TrendIcon = mistake.trend === "improving" ? ArrowDown : mistake.trend === "worsening" ? ArrowUp : mistake.trend === "new" ? Sparkles : Minus;
  const trendTone =
    mistake.trend === "improving" ? "text-success"
    : mistake.trend === "worsening" ? "text-destructive"
    : mistake.trend === "new" ? "text-primary"
    : "text-muted-foreground";

  return (
    <div className="group rounded-2xl border border-border/60 bg-card/60 p-4 transition hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg border", catCls)}>
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-[15px] font-semibold">{mistake.title}</div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{mistake.category}</Badge>
            <Badge className={cn("text-[10px] uppercase", SEV_TONE[mistake.severity])}>{mistake.severity}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{rule.short}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/20 p-2">
        <Metric label="Frequency" value={String(mistake.frequency)} />
        <Metric
          label="Est. cost"
          value={mistake.impact_r === 0 ? "—" : `${mistake.impact_r > 0 ? "+" : ""}${mistake.impact_r.toFixed(1)}R`}
          tone={impactTone}
        />
        <Metric
          label="Trend"
          value={
            <span className={cn("inline-flex items-center gap-1 font-medium capitalize", trendTone)}>
              <TrendIcon className="h-3 w-3" /> {mistake.trend}
            </span>
          }
        />
      </div>

      <div className="mt-3 rounded-lg border border-dashed border-border/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recommendation</div>
        <p className="mt-1 text-sm">{rule.fix}</p>
      </div>

      {mistake.occurrences.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Example trades</span>
            <span>{mistake.occurrences.length} total</span>
          </div>
          <ul className="space-y-1">
            {mistake.occurrences.slice(0, 3).map((o) => (
              <li key={`${o.source}-${o.trade_id}-${o.at}`} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[9px] uppercase">{o.source}</Badge>
                <span className="truncate text-muted-foreground">{new Date(o.at).toLocaleString()}</span>
                {o.detail ? <span className="truncate text-foreground/80">· {o.detail}</span> : null}
                <TradeOpenLink source={o.source} id={o.trade_id} />
              </li>
            ))}
          </ul>
          {mistake.occurrences.length > 3 && (
            <div className="mt-1 text-[11px] text-muted-foreground">+{mistake.occurrences.length - 3} more</div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function TradeOpenLink({ source, id }: { source: "journal" | "paper"; id: string }) {
  if (source === "journal") {
    return (
      <Link to="/journal/$entryId" params={{ entryId: id }} className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline">
        Open <ArrowUpRight className="h-3 w-3" />
      </Link>
    );
  }
  return (
    <Link to="/trades/$tradeId" params={{ tradeId: id }} className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline">
      Open <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

// Re-export a small helper for other views
export function trendArrow(trend: DetectedMistake["trend"]) {
  return trend === "improving" ? "↓" : trend === "worsening" ? "↑" : trend === "new" ? "•" : "→";
}
export { ArrowRight };
