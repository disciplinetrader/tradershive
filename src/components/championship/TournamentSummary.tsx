import { Link } from "@tanstack/react-router";
import { Trophy, BookOpen, BarChart3, Film, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { cn } from "@/lib/utils";

/**
 * Post-tournament summary card. Rendered only when champ.status === 'completed'
 * and the current user has a ranking row.
 */
export function TournamentSummary({
  champ,
  rank,
  totalParticipants,
}: {
  champ: { id: string; slug: string; name: string; season_year: number; season_month: number };
  rank: {
    rank?: number | null;
    pnl?: number;
    r_multiple?: number;
    win_rate?: number;
    profit_factor?: number;
    max_drawdown?: number;
    total_trades?: number;
  };
  totalParticipants: number;
}) {
  const finalRank = rank.rank ?? 0;
  const isPodium = finalRank > 0 && finalRank <= 3;
  const isTop10 = finalRank > 0 && finalRank <= 10;
  return (
    <div className="overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/10 via-primary/5 to-background p-6 shadow-elegant">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-warning/20 text-warning">
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-warning">Tournament complete</div>
            <div className="text-lg font-bold">{champ.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            "rounded-lg border px-3 py-1 text-sm font-bold",
            isPodium ? "border-warning/40 bg-warning/10 text-warning" : "bg-card",
          )}>
            Final: #{finalRank || "—"} <span className="text-xs font-normal text-muted-foreground">/ {totalParticipants}</span>
          </div>
          {isTop10 ? (
            <div className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Award className="h-3 w-3" /> Top 10
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Cell label="Net PnL" value={`${(rank.pnl ?? 0) >= 0 ? "+" : ""}$${Number(rank.pnl ?? 0).toFixed(0)}`} tone={(rank.pnl ?? 0) >= 0 ? "success" : "danger"} />
        <Cell label="Win rate" value={`${Number(rank.win_rate ?? 0).toFixed(0)}%`} />
        <Cell label="Avg RR" value={`${Number(rank.r_multiple ?? 0).toFixed(2)}R`} />
        <Cell label="Profit factor" value={`${Number(rank.profit_factor ?? 0).toFixed(2)}`} />
        <Cell label="Max drawdown" value={`$${Number(rank.max_drawdown ?? 0).toFixed(0)}`} tone="danger" />
        <Cell label="Total trades" value={String(rank.total_trades ?? 0)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/replay">
          <Button size="sm">
            <Film className="mr-1.5 h-3.5 w-3.5" /> Replay tournament
          </Button>
        </Link>
        <Link to="/journal">
          <Button size="sm" variant="outline">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Open journal
          </Button>
        </Link>
        <Link to="/statistics">
          <Button size="sm" variant="outline">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> View analytics
          </Button>
        </Link>
        <ShareToCommunityButton
          sourceType="championship"
          sourceRef={`${champ.season_year}-${String(champ.season_month).padStart(2, "0")}`}
          label="Share result"
          variant="outline"
        />
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-base font-bold tabular-nums", tone === "success" && "text-success", tone === "danger" && "text-danger")}>{value}</div>
    </div>
  );
}
