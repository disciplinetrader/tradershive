import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Flame, Clock, History, Swords, Search, Filter, Zap, Target } from "lucide-react";
import { listBattles, listMyBattleStats, tickBattles, joinRandom, getMatchmakingStatus, cancelMatchmaking } from "@/lib/battle-arena.functions";
import { BattleCard } from "@/components/battle-arena/BattleCard";
import { MyBattleStats } from "@/components/battle-arena/MyBattleStats";
import { JoinByCodeDialog } from "@/components/battle-arena/JoinByCodeDialog";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuLabel, 
  DropdownMenuRadioGroup, 
  DropdownMenuRadioItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/battle-arena/")({
  component: BattleArenaHome,
});

function BattleArenaHome() {
  const qc = useQueryClient();
  const fnList = useServerFn(listBattles);
  const fnStats = useServerFn(listMyBattleStats);
  const fnTick = useServerFn(tickBattles);
  const fnJoinRandom = useServerFn(joinRandom);
  const fnGetQueue = useServerFn(getMatchmakingStatus);
  const fnCancelQueue = useServerFn(cancelMatchmaking);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const featured = useQuery({ queryKey: ["battles", "featured"], queryFn: () => fnList({ data: { scope: "featured", limit: 6 } }) });
  const live = useQuery({ queryKey: ["battles", "live"], queryFn: () => fnList({ data: { scope: "live", limit: 12 } }), refetchInterval: 15000 });
  const upcoming = useQuery({ queryKey: ["battles", "upcoming"], queryFn: () => fnList({ data: { scope: "upcoming", limit: 12 } }) });
  const ranked = useQuery({ queryKey: ["battles", "ranked"], queryFn: () => fnList({ data: { scope: "ranked", limit: 12 } }) });
  const mine = useQuery({ queryKey: ["battles", "mine"], queryFn: () => fnList({ data: { scope: "mine", limit: 12 } }) });
  const history = useQuery({ queryKey: ["battles", "history"], queryFn: () => fnList({ data: { scope: "history", limit: 6 } }) });
  const stats = useQuery({ queryKey: ["battles", "stats"], queryFn: () => fnStats() });
  const queue = useQuery({ queryKey: ["matchmaking", "status"], queryFn: () => fnGetQueue(), refetchInterval: 5000 });

  useEffect(() => {
    const t = setInterval(() => { fnTick().catch(() => {}); }, 30000);
    fnTick().catch(() => {});
    return () => clearInterval(t);
  }, [fnTick]);

  useEffect(() => {
    const ch = supabase
      .channel("battles-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "battles" }, () => {
        qc.invalidateQueries({ queryKey: ["battles"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const handleJoinRandom = async (ranked: boolean) => {
    try {
      const res = await fnJoinRandom({ data: { battleType: "profit_target", isRanked: ranked } });
      if (res.battleId) {
        toast.success("Found a match! Joining battle...");
      } else {
        toast.success("Joined matchmaking queue.");
        qc.invalidateQueries({ queryKey: ["matchmaking"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Matchmaking failed");
    }
  };

  const handleCancelQueue = async () => {
    try {
      await fnCancelQueue();
      toast.success("Left matchmaking queue.");
      qc.invalidateQueries({ queryKey: ["matchmaking"] });
    } catch (err: any) {
      toast.error("Failed to leave queue");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-black tracking-tight">HIVE Arena</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg font-medium leading-relaxed">
            Compete in real-time paper trading matches. Dominate the HIVE Rating leaderboard, 
            prove your consistency, and climb from Initiate to Sovereign.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {queue.data ? (
            <div className="flex items-center gap-3 rounded-full bg-primary/10 pl-4 pr-1 py-1 border border-primary/20">
              <span className="flex items-center gap-2 text-xs font-bold text-primary animate-pulse">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Finding Match...
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full hover:bg-primary/20 hover:text-primary" onClick={handleCancelQueue}>
                <Plus className="h-3.5 w-3.5 rotate-45" />
              </Button>
            </div>
          ) : (
            <>
              <Button size="sm" variant="outline" className="h-9 font-bold px-4" onClick={() => handleJoinRandom(true)}>
                <Zap className="mr-2 h-4 w-4 fill-primary text-primary" /> Ranked Match
              </Button>
              <Button size="sm" variant="outline" className="h-9 font-bold px-4" onClick={() => handleJoinRandom(false)}>
                Join Random
              </Button>
            </>
          )}
          <JoinByCodeDialog />
          <Button asChild size="sm" className="h-9 font-bold px-4 shadow-lg shadow-primary/20">
            <Link to="/battle-arena/create"><Plus className="mr-1.5 h-4 w-4" />Create Arena Match</Link>
          </Button>
        </div>
      </div>

      <MyBattleStats data={stats.data} />

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:max-w-md group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="Search battles..." 
            className="pl-9 bg-card/40 border-border/60 rounded-xl focus:ring-primary/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl border-border/60 bg-card/40 font-bold">
              <Filter className="mr-2 h-4 w-4" /> Filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            <DropdownMenuLabel>Arena Type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={filterType} onValueChange={setFilterType}>
              <DropdownMenuRadioItem value="all">All Types</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ranked">Ranked Only</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="profit_target">Target Chase</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="time_trial">Market Sprint</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-10">
          <Section
            title="Featured Competitions" icon={Flame} items={featured.data} loading={featured.isLoading}
            empty={{ title: "No featured matches", body: "Check back later for curated events." }}
          />
          
          <Section
            title="Live Battles" icon={Target} items={live.data} loading={live.isLoading} pulse
            empty={{ title: "No live matches", body: "Kick off a session to get listed here." }}
          />

          <Section
            title="Ranked Play" icon={Zap} items={ranked.data} loading={ranked.isLoading}
            empty={{ title: "No ranked battles", body: "Competitive play is quiet right now." }}
          />

          <Section
            title="Upcoming Events" icon={Clock} items={upcoming.data} loading={upcoming.isLoading}
            empty={{ title: "Nothing scheduled", body: "Schedule a future battle to build hype." }}
          />
        </div>

        <div className="space-y-10">
          <Section
            title="My History" icon={History} items={mine.data} loading={mine.isLoading} isCompact
            empty={{ title: "No participation yet", body: "Join your first battle to see history." }}
          />
          
          <Section
            title="Recent Hall of Fame" icon={History} items={history.data} loading={history.isLoading} isCompact
            empty={{ title: "Arena is new", body: "Finished results will appear here." }}
          />
        </div>
      </div>
    </div>
  );
}

type EmptyCopy = {
  title: string;
  body?: string;
};

function Section({ 
  title, 
  icon: Icon, 
  items, 
  loading, 
  empty, 
  pulse,
  isCompact
}: { 
  title: string; 
  icon: React.ComponentType<{ className?: string }>; 
  items?: any[]; 
  loading?: boolean; 
  empty: EmptyCopy; 
  pulse?: boolean;
  isCompact?: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl bg-primary/5 border border-primary/10 ${pulse ? "animate-pulse" : ""}`}>
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
        </div>
        {items && items.length > 0 && (
          <Badge variant="outline" className="rounded-full font-bold px-2.5 bg-card/30">
            {items.length}
          </Badge>
        )}
      </div>

      {loading && !items ? (
        <CardGridSkeleton count={isCompact ? 2 : 3} cardClassName={isCompact ? "h-32" : "h-48"} />
      ) : !items?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/40 text-muted-foreground/60"><Icon className="h-6 w-6" /></div>
          <div>
            <div className="text-sm font-bold text-foreground">{empty.title}</div>
            {empty.body ? <p className="mt-1 max-w-sm text-xs text-muted-foreground font-medium">{empty.body}</p> : null}
          </div>
        </div>
      ) : (
        <div className={`animate-content-in grid grid-cols-1 gap-4 ${isCompact ? "" : "sm:grid-cols-2"}`}>
          {items.map((b) => <BattleCard key={b.id} battle={b} />)}
        </div>
      )}
    </section>
  );
}
