import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { GraduationCap, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { listPropChallenges } from "@/lib/prop-challenges.functions";

/**
 * Dashboard widget — shows the user's active prop firm challenge with a
 * compact profit / drawdown progress summary. Renders nothing when the
 * user has no active challenge, so it stays out of the way for the
 * majority of traders.
 */
export function PropChallengeWidget() {
  const list = useServerFn(listPropChallenges);
  const q = useQuery({ queryKey: ["prop-challenges"], queryFn: () => list() });

  const active = (q.data ?? []).find((c) => c.status === "active");
  if (!active) return null;

  const start = Number(active.starting_equity);
  const eq = Number(active.current_equity);
  const profitPct = ((eq - start) / start) * 100;
  const targetPct = active.profit_target_pct;
  const ddPct = ((Number(active.peak_equity) - eq) / start) * 100;
  const ddLimit = active.max_total_drawdown_pct;

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <GraduationCap className="h-4 w-4 text-primary" /> Prop challenge
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{active.name}</div>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link to="/prop-challenges/$id" params={{ id: active.id }}>
            View <ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        <Row label="Profit target" value={`${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}% / ${targetPct}%`}
          pct={Math.max(0, Math.min(100, (profitPct / targetPct) * 100))}
          tone={profitPct >= targetPct ? "pos" : "info"} />
        <Row label="Drawdown used" value={`${ddPct.toFixed(2)}% / ${ddLimit}%`}
          pct={Math.min(100, (ddPct / ddLimit) * 100)}
          tone={ddPct > ddLimit * 0.7 ? "warn" : "info"} />
      </div>
    </GlassCard>
  );
}

function Row({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: "pos" | "warn" | "info" }) {
  const cls = tone === "pos" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-primary";
  const bar = tone === "pos" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className={`mono-nums font-semibold ${cls}`}>{value}</span>
      </div>
      <Progress value={pct} className="mt-1 h-1" indicatorClassName={bar} />
    </div>
  );
}
