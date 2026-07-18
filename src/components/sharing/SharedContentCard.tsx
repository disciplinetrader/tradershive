import { Link } from "@tanstack/react-router";
import { Activity, Award, BarChart3, BookOpen, Brain, GitBranch, Play, Swords, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type Snap = Record<string, any>;

function fmt(n: any, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

const ICONS: Record<string, any> = {
  trading_workspace: Activity, journal: BookOpen, battle: Swords, championship: Trophy,
  replay: Play, strategy: GitBranch, statistics: BarChart3, ai_review: Brain, achievement: Award,
};

export function SharedContentCard({ share }: { share: any }) {
  if (!share) return null;
  const s: Snap = share.snapshot ?? {};
  const Icon = ICONS[share.source_type] ?? Activity;

  const stats: { label: string; value: string; tone?: "up" | "down" | "neutral" }[] = [];
  const pnl = s.pnl ?? s.total_pnl ?? null;
  if (pnl != null) stats.push({ label: "PnL", value: `${pnl >= 0 ? "+" : ""}${fmt(pnl)}`, tone: pnl >= 0 ? "up" : "down" });
  if (s.rr != null) stats.push({ label: "R", value: `${s.rr >= 0 ? "+" : ""}${fmt(s.rr, 2)}R`, tone: s.rr >= 0 ? "up" : "down" });
  if (s.r_multiple != null) stats.push({ label: "R", value: `${fmt(s.r_multiple, 2)}R`, tone: s.r_multiple >= 0 ? "up" : "down" });
  if (s.win_rate != null) stats.push({ label: "WR", value: `${fmt(s.win_rate, 1)}%` });
  if (s.profit_factor != null) stats.push({ label: "PF", value: fmt(s.profit_factor, 2) });
  if (s.trades != null) stats.push({ label: "Trades", value: String(s.trades) });
  if (s.trades_count != null) stats.push({ label: "Trades", value: String(s.trades_count) });
  if (s.max_drawdown != null) stats.push({ label: "DD", value: fmt(s.max_drawdown) });
  if (s.rank != null) stats.push({ label: "Rank", value: `#${s.rank}` });
  if (s.grade != null) stats.push({ label: "Grade", value: String(s.grade) });
  if (s.overall_score != null) stats.push({ label: "Score", value: fmt(s.overall_score) });
  if (s.avg_r != null) stats.push({ label: "Avg", value: `${fmt(s.avg_r, 2)}R` });
  if (s.timeframe) stats.push({ label: "TF", value: s.timeframe });
  if (s.xp) stats.push({ label: "XP", value: `+${s.xp}` });

  const link = linkFor(share);
  const Wrapper: any = link ? Link : "div";
  const wrapperProps: any = link ? link : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="mt-3 block overflow-hidden rounded-xl border border-border/60 bg-muted/30 transition hover:border-primary/40 hover:bg-muted/50"
    >
      {share.cover_url ? (
        <div className="aspect-[16/7] w-full overflow-hidden bg-black/20">
          <img src={share.cover_url} alt={share.title ?? ""} className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : null}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {SOURCE_LABEL[share.source_type] ?? share.source_type}
            </div>
            {share.title ? <div className="mt-0.5 truncate text-sm font-semibold">{share.title}</div> : null}
            {share.summary ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{share.summary}</div> : null}
          </div>
        </div>
        {stats.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {stats.slice(0, 8).map((st, i) => (
              <div key={i} className="rounded-lg bg-background/60 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{st.label}</div>
                <div className={cn(
                  "mt-0.5 text-sm font-semibold tabular-nums",
                  st.tone === "up" && "text-emerald-500",
                  st.tone === "down" && "text-rose-500",
                )}>{st.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Wrapper>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  trading_workspace: "Trade", journal: "Journal", battle: "Battle Arena", championship: "Championship",
  replay: "Replay", strategy: "Strategy", statistics: "Performance", ai_review: "AI Review",
  achievement: "Achievement", challenge: "Challenge",
};

function linkFor(share: any): any {
  const id = share.source_id;
  if (!id) return null;
  switch (share.source_type) {
    case "battle": return { to: "/battle-arena/$battleId", params: { battleId: id } };
    case "replay": return { to: "/replay/$sessionId", params: { sessionId: id } };
    case "strategy": return { to: "/strategies/$id", params: { id } };
    case "journal": return { to: "/journal/$id", params: { id } };
    default: return null;
  }
}
