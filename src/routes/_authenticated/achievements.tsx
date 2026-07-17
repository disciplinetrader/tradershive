import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AchievementCard } from "@/components/gamification/AchievementCard";
import { listAchievements, listBadges } from "@/lib/gamification.functions";
import { LEAGUES } from "@/lib/gamification/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({ meta: [{ title: "Achievements — TradersHIVE Arena" }] }),
  component: AchievementsPage,
});

const CATEGORIES = ["all", "trading", "journal", "challenges", "consistency", "levels", "community", "events", "secret"] as const;

function AchievementsPage() {
  const listAch = useServerFn(listAchievements);
  const listBg = useServerFn(listBadges);
  const { data: achievements, isLoading } = useQuery({
    queryKey: ["gami", "achievements"],
    queryFn: () => listAch({}) as unknown as Promise<any[]>,
  });
  const { data: badges } = useQuery({
    queryKey: ["gami", "badges"],
    queryFn: () => listBg({}) as unknown as Promise<any[]>,
  });

  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let list = achievements ?? [];
    if (cat !== "all") list = list.filter((a) => a.category === cat);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((a) => a.title.toLowerCase().includes(s) || a.description.toLowerCase().includes(s));
    }
    return list;
  }, [achievements, cat, q]);

  const unlockedCount = (achievements ?? []).filter((a) => a.unlocked).length;
  const total = achievements?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achievements"
        description={`${unlockedCount} of ${total} unlocked — keep climbing.`}
      />

      {/* Badges strip */}
      <GlassCard className="p-5">
        <h3 className="mb-3 text-sm font-semibold">League Badges</h3>
        <div className="flex flex-wrap gap-2">
          {(badges ?? []).map((b) => (
            <div key={b.id} className={cn(
              "relative flex items-center gap-2 rounded-xl border px-3 py-2 transition",
              b.earned ? "border-primary/40 bg-primary/10 shadow-elegant" : "border-border/40 bg-surface/40 opacity-70",
            )}>
              <div className="text-xl">{b.icon}</div>
              <div>
                <div className="text-xs font-semibold">{b.title}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{b.tier}</div>
              </div>
            </div>
          ))}
          {(!badges || badges.length === 0) && <span className="text-xs text-muted-foreground">No badges yet.</span>}
        </div>
      </GlassCard>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Search achievements..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Tabs value={cat} onValueChange={setCat}>
          <TabsList className="glass overflow-x-auto">
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c} value={c} className="capitalize">{c}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">No achievements match.</GlassCard>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((a) => <AchievementCard key={a.id} a={a} />)}
        </div>
      )}

      {/* Leagues explainer */}
      <GlassCard className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Leagues</h3>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {LEAGUES.map((l) => (
            <div key={l.key} className="rounded-xl border border-border/40 bg-surface/40 p-3 text-center">
              <div className="text-lg font-bold" style={{ color: l.color }}>{l.label}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lvl {l.minLevel}+</div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
