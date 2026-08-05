import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Search, Trophy } from "lucide-react";
import { toast } from "sonner";
import { listChampionships, joinChampionshipLive } from "@/lib/championship.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TournamentCard } from "@/components/championship/TournamentCard";

export const Route = createFileRoute("/_authenticated/battle-arena/tournaments/")({
  component: ChampionshipIndex,
});

type SortKey = "starts_soonest" | "biggest_prize" | "most_participants" | "duration";

function ChampionshipIndex() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(listChampionships);
  const joinLive = useServerFn(joinChampionshipLive);

  const [tab, setTab] = useState<"live" | "upcoming" | "past" | "mine">("live");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("starts_soonest");

  const current = useQuery({
    queryKey: ["champ", "current"],
    queryFn: () => fn({ data: { scope: "current" } }) as unknown as Promise<any[]>,
  });
  const upcoming = useQuery({
    queryKey: ["champ", "next"],
    queryFn: () => fn({ data: { scope: "next", limit: 24 } }) as unknown as Promise<any[]>,
  });
  const past = useQuery({
    queryKey: ["champ", "past"],
    queryFn: () => fn({ data: { scope: "past", limit: 24 } }) as unknown as Promise<any[]>,
  });
  const mine = useQuery({
    queryKey: ["champ", "mine"],
    queryFn: () => fn({ data: { scope: "mine", limit: 24 } }) as unknown as Promise<any[]>,
  });

  const activeList = useMemo(() => {
    const raw =
      tab === "live" ? (current.data ?? []).filter((c) => c.status === "live") :
      tab === "upcoming" ? [...(upcoming.data ?? []), ...(current.data ?? []).filter((c) => c.status !== "live")] :
      tab === "past" ? past.data ?? [] :
      mine.data ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? raw.filter((c: any) =>
          [c.name, c.description, ...(c.allowed_markets ?? [])].filter(Boolean).some((s: string) => String(s).toLowerCase().includes(needle)),
        )
      : raw;
    const sorted = [...filtered].sort((a: any, b: any) => {
      switch (sort) {
        case "biggest_prize":
          return Number(b.prize_info?.pool ?? 0) - Number(a.prize_info?.pool ?? 0);
        case "most_participants":
          return Number(b.participant_count ?? 0) - Number(a.participant_count ?? 0);
        case "duration": {
          const da = new Date(a.end_at).getTime() - new Date(a.start_at).getTime();
          const db = new Date(b.end_at).getTime() - new Date(b.start_at).getTime();
          return db - da;
        }
        case "starts_soonest":
        default:
          return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
      }
    });
    return sorted;
  }, [tab, current.data, upcoming.data, past.data, mine.data, q, sort]);

  const quickJoin = useMutation({
    mutationFn: (championship_id: string) => joinLive({ data: { championship_id } }),
    onSuccess: () => {
      toast.success("You're in — $10,000 tournament account created.");
      qc.invalidateQueries({ queryKey: ["champ"] });
      setTimeout(() => nav({ to: "/trading" }), 800);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to join tournament"),
  });

  const isLoading =
    (tab === "live" && current.isLoading) ||
    (tab === "upcoming" && (upcoming.isLoading || current.isLoading)) ||
    (tab === "past" && past.isLoading) ||
    (tab === "mine" && mine.isLoading);

  const featured = (current.data ?? []).find((c) => c.is_featured) ?? (current.data ?? [])[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Arena Tournaments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compete in monthly championships, sponsored events, and community battles within the HIVE Arena. Every result contributes to your career stats.
          </p>
        </div>
        <Link to="/championship/hall-of-fame">
          <Button variant="outline" size="sm">
            <History className="mr-1.5 h-3.5 w-3.5" /> Hall of Fame
          </Button>
        </Link>
      </header>

      {featured ? (
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-warning/10 via-primary/5 to-background p-4 shadow-elegant">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Trophy className="h-4 w-4" /> Featured Tournament
          </div>
          <TournamentCard
            champ={featured}
            participantCount={featured.participant_count}
            onQuickJoin={(id) => quickJoin.mutate(id)}
            quickJoinPending={quickJoin.isPending}
          />
        </div>
      ) : null}

      <div className="rounded-2xl border bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="mine">My tournaments</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto flex flex-1 flex-wrap items-center gap-2 sm:flex-none">
            <div className="relative sm:min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-8" placeholder="Search tournaments…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starts_soonest">Starts soonest</SelectItem>
                <SelectItem value="biggest_prize">Biggest prize</SelectItem>
                <SelectItem value="most_participants">Most participants</SelectItem>
                <SelectItem value="duration">Longest duration</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsContent value={tab} className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted/40" />
                ))}
              </div>
            ) : activeList.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {activeList.map((c: any) => (
                  <TournamentCard
                    key={c.id}
                    champ={c}
                    participantCount={c.participant_count}
                    onQuickJoin={(id) => quickJoin.mutate(id)}
                    quickJoinPending={quickJoin.isPending}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Trophy}
                title={
                  tab === "live" ? "No live tournaments right now" :
                  tab === "upcoming" ? "No upcoming tournaments scheduled" :
                  tab === "past" ? "No past tournaments to review" :
                  "You haven't joined a tournament yet"
                }
                description={
                  tab === "mine"
                    ? "Join a live or upcoming tournament to compete against other traders."
                    : "Championships run weekly. Jump into the Battle Arena while you wait for the next one."
                }
                action={
                  tab === "mine"
                    ? { label: "Browse Tournaments", href: "/championship" }
                    : { label: "Open Battle Arena", href: "/battle-arena" }
                }
                secondaryAction={{ label: "Practice in Replay", href: "/replay" }}
              />

            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
