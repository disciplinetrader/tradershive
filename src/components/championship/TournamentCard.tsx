import { Link } from "@tanstack/react-router";
import { Users, Trophy, Sparkles, Shield, Calendar, Zap, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownPill } from "./CountdownPill";
import { cn } from "@/lib/utils";

type Champ = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: string;
  start_at: string;
  end_at: string;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  starting_balance: number;
  max_drawdown_pct: number;
  allowed_markets?: string[] | null;
  prize_info?: any;
  is_featured?: boolean;
  banner_url?: string | null;
  win_condition?: string;
};

const STATUS_STYLES: Record<string, string> = {
  live: "bg-success/15 text-success border-success/30",
  registration: "bg-primary/15 text-primary border-primary/30",
  upcoming: "bg-warning/15 text-warning border-warning/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-danger/15 text-danger border-danger/30",
  grading: "bg-muted text-muted-foreground border-border",
};

function durationDays(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

function difficulty(champ: Champ): "Beginner" | "Intermediate" | "Pro" {
  const dd = Number(champ.max_drawdown_pct ?? 0);
  if (dd >= 15) return "Beginner";
  if (dd >= 8) return "Intermediate";
  return "Pro";
}

/**
 * Modern tournament card used on the Tournament home + lobby lists.
 * Includes status, countdown, entry, participants, prize, markets, difficulty, and CTAs.
 */
export function TournamentCard({
  champ,
  participantCount,
  registered,
  onQuickJoin,
  quickJoinPending,
}: {
  champ: Champ;
  participantCount?: number;
  registered?: boolean;
  onQuickJoin?: (id: string) => void;
  quickJoinPending?: boolean;
}) {
  const status = champ.status;
  const featured = champ.is_featured;
  const prizePool =
    (champ.prize_info?.pool as number | undefined) ??
    (champ.prize_info?.total as number | undefined) ??
    undefined;
  const entryFee = (champ.prize_info?.entry_fee as number | undefined) ?? 0;
  const days = durationDays(champ.start_at, champ.end_at);
  const diff = difficulty(champ);
  const canQuickJoin = onQuickJoin && (status === "live" || status === "registration");
  const targetLabel = status === "live" ? "Ends" : status === "completed" ? "Ended" : "Starts";
  const target = status === "live" ? champ.end_at : status === "completed" ? champ.end_at : champ.start_at;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elegant",
        featured && "border-primary/40",
      )}
    >
      {/* Banner */}
      <div className="relative h-24 overflow-hidden bg-gradient-to-br from-primary/15 via-warning/10 to-background">
        {champ.banner_url ? (
          <img src={champ.banner_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-70" />
        ) : (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--primary) 40%, transparent), transparent 40%), radial-gradient(circle at 80% 60%, color-mix(in oklab, var(--warning) 30%, transparent), transparent 45%)",
            }}
          />
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className={cn("uppercase tracking-wider text-[10px]", STATUS_STYLES[status] ?? STATUS_STYLES.upcoming)}
          >
            {status === "live" ? (
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            ) : null}
            {status}
          </Badge>
          {featured ? (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[10px] uppercase text-warning">
              <Trophy className="mr-1 h-2.5 w-2.5" /> Featured
            </Badge>
          ) : null}
        </div>
        <div className="absolute right-3 top-3">
          <CountdownPill target={target} label={targetLabel} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <Link
            to="/championship/$slug"
            params={{ slug: champ.slug }}
            className="text-base font-semibold leading-tight tracking-tight hover:text-primary"
          >
            {champ.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {champ.description ?? "Compete on live paper trading with global rankings."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Meta icon={Calendar} label="Duration" value={`${days} day${days > 1 ? "s" : ""}`} />
          <Meta icon={Users} label="Participants" value={String(participantCount ?? 0)} />
          <Meta
            icon={Sparkles}
            label="Prize pool"
            value={prizePool != null ? `$${Number(prizePool).toLocaleString()}` : "XP + Badges"}
          />
          <Meta
            icon={Shield}
            label="Entry"
            value={entryFee > 0 ? `$${entryFee.toLocaleString()}` : "Free"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <Badge variant="secondary" className="uppercase">
            {diff}
          </Badge>
          {(champ.allowed_markets ?? []).slice(0, 3).map((m) => (
            <Badge key={m} variant="outline" className="uppercase text-[10px]">
              {m}
            </Badge>
          ))}
          {(champ.allowed_markets?.length ?? 0) > 3 ? (
            <span className="text-muted-foreground">+{(champ.allowed_markets?.length ?? 0) - 3}</span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          {canQuickJoin ? (
            <Button
              size="sm"
              className="flex-1"
              disabled={registered || quickJoinPending}
              onClick={(e) => {
                e.preventDefault();
                onQuickJoin?.(champ.id);
              }}
            >
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              {registered ? "Joined" : status === "live" ? "Quick Join" : "Register"}
            </Button>
          ) : null}
          <Link to="/championship/$slug" params={{ slug: champ.slug }} className={cn(!canQuickJoin && "flex-1")}>
            <Button size="sm" variant={canQuickJoin ? "outline" : "default"} className={cn(!canQuickJoin && "w-full")}>
              Details <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate font-semibold">{value}</div>
      </div>
    </div>
  );
}
