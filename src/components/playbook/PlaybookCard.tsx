import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as icons from "lucide-react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { togglePlaybookFavorite } from "@/lib/playbook.functions";

export type PlaybookRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  market: string | null;
  markets: string[];
  timeframes: string[];
  tags: string[];
  color: string;
  icon: string;
  cover_url: string | null;
  is_favorite: boolean;
  kpi: { trades: number; win_rate: number; avg_r: number };
};

export function PlaybookCard({ pb }: { pb: PlaybookRow }) {
  const Icon = ((icons as any)[pb.icon] ?? icons.BookMarked) as React.ComponentType<{ className?: string }>;
  const qc = useQueryClient();
  const toggle = useServerFn(togglePlaybookFavorite);
  const fav = useMutation({
    mutationFn: async () => toggle({ data: { id: pb.id, value: !pb.is_favorite } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["playbook-library"] });
      const prev = qc.getQueriesData({ queryKey: ["playbook-library"] });
      qc.setQueriesData({ queryKey: ["playbook-library"] }, (old: any) =>
        Array.isArray(old) ? old.map((r) => (r.id === pb.id ? { ...r, is_favorite: !pb.is_favorite } : r)) : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([k, v]) => qc.setQueryData(k, v));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["playbook-library"] }),
  });

  const wr = pb.kpi.trades ? Math.round(pb.kpi.win_rate * 100) : null;
  const avgR = pb.kpi.trades ? pb.kpi.avg_r : null;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-sm transition hover:border-primary/40 hover:shadow-lg">
      <Link to="/strategies/playbooks/$id" params={{ id: pb.id }} className="block">
        <div className="relative h-28 w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${pb.color}22, ${pb.color}05)` }}>
          {pb.cover_url ? (
            <img src={pb.cover_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <Icon className="h-10 w-10 opacity-40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/40 to-transparent" />
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md" style={{ background: `${pb.color}33`, color: pb.color }}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            {pb.category ? <Badge variant="secondary" className="text-[10px]">{pb.category}</Badge> : null}
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <div className="line-clamp-1 text-[15px] font-semibold leading-tight">{pb.name}</div>
            <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
              {pb.description ?? "No description yet."}
            </p>
          </div>

          <div className="flex flex-wrap gap-1">
            {pb.markets.slice(0, 2).map((m) => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}
            {pb.timeframes.slice(0, 3).map((tf) => <Badge key={tf} variant="outline" className="text-[10px]">{tf}</Badge>)}
            {pb.tags.slice(0, 2).map((t) => <Badge key={t} className="bg-primary/10 text-[10px] text-primary hover:bg-primary/15">#{t}</Badge>)}
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-border/40 pt-3 text-center">
            <Kpi label="Trades" value={pb.kpi.trades ? String(pb.kpi.trades) : "—"} />
            <Kpi label="Win %" value={wr == null ? "—" : `${wr}%`} tone={wr != null ? (wr >= 50 ? "up" : "down") : undefined} />
            <Kpi label="Avg R" value={avgR == null ? "—" : `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`} tone={avgR != null ? (avgR >= 0 ? "up" : "down") : undefined} />
          </div>
        </div>
      </Link>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2 h-7 w-7 rounded-full bg-background/70 backdrop-blur transition hover:bg-background"
        onClick={(e) => { e.preventDefault(); fav.mutate(); }}
        aria-label={pb.is_favorite ? "Remove favorite" : "Add favorite"}
      >
        <Star className={cn("h-3.5 w-3.5", pb.is_favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
      </Button>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "font-mono text-sm font-semibold tabular-nums",
        tone === "up" && "text-success",
        tone === "down" && "text-destructive",
      )}>
        {value}
      </div>
    </div>
  );
}
