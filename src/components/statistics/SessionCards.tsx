import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { useStatistics } from "./context";
import { groupBy } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtPercent } from "@/lib/statistics/format";
import { SESSION_LABEL } from "@/lib/statistics/session";
import { cn } from "@/lib/utils";
import { Clock, MapPin, TrendingUp } from "lucide-react";

export function SessionCards() {
  const { filtered } = useStatistics();
  const bySession = useMemo(() => groupBy(filtered, (t) => t.session ?? "other"), [filtered]);
  const keys = ["asia", "london", "new_york", "other"];
  const map = new Map(bySession.map((r) => [r.key, r] as const));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {keys.map((k) => {
        const r = map.get(k);
        return (
          <GlassCard key={k} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-4 w-4" /></div>
                <div>
                  <div className="text-sm font-semibold">{SESSION_LABEL[k]}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{r?.trades ?? 0} trades</div>
                </div>
              </div>
              {r ? (
                <Badge variant="outline" className={cn(r.netProfit >= 0 ? "border-success/40 text-success" : "border-danger/40 text-danger")}>
                  {fmtCurrency(r.netProfit)}
                </Badge>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <StatMini label="Win rate" value={r ? fmtPercent(r.winRate) : "—"} />
              <StatMini label="Avg RR" value={r ? `${r.avgRR.toFixed(2)}R` : "—"} />
              <StatMini label="Best" value={r ? fmtCurrency(r.bestTrade) : "—"} tone="up" />
              <StatMini label="Worst" value={r ? fmtCurrency(r.worstTrade) : "—"} tone="down" />
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

function StatMini({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold tabular-nums mt-1", tone === "up" && "text-success", tone === "down" && "text-danger")}>{value}</div>
    </div>
  );
}
