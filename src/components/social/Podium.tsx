import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LeagueBadge } from "./LeagueBadge";
import { CountryFlag } from "./CountryFlag";
import { formatMetric, type CategoryDef } from "@/lib/social/constants";
import { cn } from "@/lib/utils";

export interface PodiumRow {
  rank: number;
  profile: { id: string; username: string; display_name: string | null; avatar_url: string | null; country: string | null; league: string | null; xp: number };
  value: number;
}

const PODIUM = [
  { rank: 1, height: "h-40", grad: "from-yellow-400 to-amber-600", ring: "ring-yellow-400/60", label: "Champion" },
  { rank: 2, height: "h-32", grad: "from-slate-300 to-slate-500", ring: "ring-slate-300/60", label: "Runner-up" },
  { rank: 3, height: "h-28", grad: "from-orange-400 to-orange-700", ring: "ring-orange-400/60", label: "Bronze" },
];

export function Podium({ rows, category }: { rows: PodiumRow[]; category: CategoryDef }) {
  const byRank = new Map(rows.map((r) => [r.rank, r]));
  // display order: 2nd, 1st, 3rd
  const order = [2, 1, 3];
  return (
    <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
      {order.map((r, idx) => {
        const row = byRank.get(r);
        const meta = PODIUM.find((p) => p.rank === r)!;
        return (
          <motion.div
            key={r}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: idx * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-3"
          >
            {row ? (
              <Link
                to="/profile/$username"
                params={{ username: row.profile.username }}
                className="group flex flex-col items-center gap-2"
              >
                <div className="relative">
                  <div className={cn("absolute inset-0 rounded-full opacity-60 blur-xl bg-gradient-to-br", meta.grad)} />
                  <Avatar className={cn("relative h-16 w-16 border-2 border-background ring-2", meta.ring)}>
                    <AvatarImage src={row.profile.avatar_url ?? undefined} />
                    <AvatarFallback className="text-sm font-bold">{row.profile.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-background px-2 py-0.5 text-[10px] font-black tabular-nums shadow">
                    #{row.rank}
                  </div>
                </div>
                <div className="text-center">
                  <div className="max-w-[9rem] truncate text-sm font-semibold group-hover:text-primary">
                    {row.profile.display_name || row.profile.username}
                  </div>
                  <div className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <CountryFlag country={row.profile.country} />
                    <LeagueBadge league={row.profile.league} size="xs" />
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-primary">
                    {formatMetric(row.value, category.format)}
                  </div>
                </div>
              </Link>
            ) : (
              <div className="text-xs text-muted-foreground">—</div>
            )}
            <div
              className={cn(
                "relative w-full overflow-hidden rounded-t-2xl border border-b-0 border-border/60 bg-gradient-to-b shadow-inner",
                meta.height,
                meta.grad,
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="relative flex h-full items-end justify-center pb-2">
                <span className="text-lg font-black text-white/90 drop-shadow-lg">{meta.rank}</span>
              </div>
              <div className="pointer-events-none absolute -inset-x-2 top-0 h-16 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shine_3s_ease-in-out_infinite]" />
            </div>
          </motion.div>
        );
      })}
      <style>{`@keyframes shine { 0%{transform:translateX(-100%)} 60%,100%{transform:translateX(200%)} }`}</style>
    </div>
  );
}
