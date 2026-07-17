import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Coins, Flame, Search, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { XPBar } from "@/components/ui/xp-bar";
import { useAuth } from "@/hooks/use-auth";
import { xpForLevel } from "@/lib/constants";

function partOfDay(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HeaderGreeting({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { profile, user } = useAuth();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const first = profile?.first_name || profile?.display_name?.split(" ")[0] || profile?.username || user?.email?.split("@")[0] || "Trader";
  const greeting = partOfDay(Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz })));

  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz });

  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const league = (profile?.league ?? "bronze").toString();
  const streak = profile?.streak ?? 0;
  const coins = profile?.coins ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <GlassCard className="relative overflow-hidden p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 gradient-radial-glow opacity-60" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary capitalize">
                <Trophy className="mr-1 h-3 w-3" /> {league} · Lvl {level}
              </Badge>
              <span>{dateStr}</span>
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums text-foreground">{timeStr}</span>
              <span aria-hidden>·</span>
              <span>{tz}</span>
            </div>
            <h1 className="mt-2 truncate text-2xl font-bold tracking-tight md:text-3xl">
              {greeting}, {first}
            </h1>
            <div className="mt-4 max-w-md">
              <XPBar level={level} xp={xp} needed={xpForLevel(level)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenSearch}
              className="glass hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:flex"
              aria-label="Open quick search"
            >
              <Search className="h-4 w-4" />
              <span>Quick search</span>
              <kbd className="ml-2 rounded border border-border/60 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </button>
            <div className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm">
              <Flame className="h-4 w-4 text-warning" />
              <span className="font-semibold tabular-nums">{streak}</span>
              <span className="text-muted-foreground">streak</span>
            </div>
            <div className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm">
              <Coins className="h-4 w-4 text-warning" />
              <span className="font-semibold tabular-nums">{coins.toLocaleString()}</span>
            </div>
            <Button size="icon" variant="outline" className="glass" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
