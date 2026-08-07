import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

import { Suspense, useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RankingCard } from "@/components/battle-arena/lobby/RankingCard";
import { LobbyRightRail } from "@/components/battle-arena/lobby/LobbyRightRail";
import { BattleList } from "@/components/battle-arena/lobby/BattleList";
import { Swords, History, BookOpen, Sparkles, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { joinRandom } from "@/lib/battle-arena.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/battle-arena/")({
  head: () => ({
    meta: [
      { title: "Battle Arena — TradersHIVE" },
      {
        name: "description",
        content: "Compete in live trading battles, climb the Ranking, and dominate the arena.",
      },
    ],
  }),
  component: BattleArenaLobby,
});

function BattleArenaLobby() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fnJoinRandom = useServerFn(joinRandom);
  const [activeTab, setActiveTab] = useState("all");
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinRandom = async () => {
    setIsJoining(true);
    try {
      const res = await fnJoinRandom({ data: { battleType: "ffa5", isRanked: true } });
      if (res.battleId) {
        toast.success("Found a match!");
        // Same reason as doJoin on the detail route: the join created a
        // paper_accounts row the cached accounts list doesn't have yet, and the
        // workspace resolves the battle account against that list.
        qc.invalidateQueries({ queryKey: ["paper", "accounts"] });
        navigate({ to: "/battle-arena/$battleId", params: { battleId: res.battleId } });
      } else if (res.queued) {
        toast.info("No open matches found. You are now in the matchmaking queue.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to join random match");
    } finally {
      setIsJoining(false);
    }
  };



  useEffect(() => {
    const ch = supabase
      .channel("battles-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "battles" }, () => {
        qc.invalidateQueries({ queryKey: ["battles"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="flex h-full w-full gap-8 animate-in fade-in duration-500">
      <div className="flex-1 space-y-8 min-w-0">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Swords className="h-5 w-5" />
              </div>
              <h1 className="text-3xl font-black tracking-tight">Battle Arena</h1>
            </div>
            <p className="text-sm text-muted-foreground font-medium max-w-2xl">
              Real-time competitive trading. Prove your edge, climb from Initiate to Sovereign, 
              and earn Rank Points (RP) by outperforming the market and your peers.
            </p>

          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-2xl border-border/40 bg-card/20 font-black uppercase tracking-widest backdrop-blur-md hover:bg-card/40"
              onClick={handleJoinRandom}
              disabled={isJoining}
            >
              <Zap className={cn("mr-2 h-4 w-4 fill-primary text-primary", isJoining && "animate-pulse")} /> 
              {isJoining ? "Searching..." : "Join Random"}
            </Button>

            <Button 
              className="rounded-2xl bg-primary font-black uppercase tracking-widest shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] active:scale-95"
              onClick={() => navigate({ to: '/battle-arena/create' })}
            >
              + New Battle
            </Button>
          </div>
        </div>


        <Suspense fallback={<div className="h-40 w-full animate-pulse rounded-3xl bg-muted/20" />}>
          <RankingCard />
        </Suspense>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 h-auto w-full justify-start gap-1 rounded-2xl border border-border/40 bg-card/20 p-1 backdrop-blur-md sm:w-auto">
            <TabsTrigger value="all" className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Zap className="mr-2 h-3.5 w-3.5" /> All Battles
            </TabsTrigger>
            <TabsTrigger value="mine" className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <History className="mr-2 h-3.5 w-3.5" /> My Battles
            </TabsTrigger>
            <TabsTrigger value="guide" className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BookOpen className="mr-2 h-3.5 w-3.5" /> How to use?
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0 focus-visible:outline-none">
            <Suspense fallback={<CardGridSkeleton count={6} />}>
              <BattleList scope="all" />
            </Suspense>
          </TabsContent>

          <TabsContent value="mine" className="mt-0 focus-visible:outline-none">
            <Suspense fallback={<CardGridSkeleton count={6} />}>
              <BattleList scope="mine" />
            </Suspense>
          </TabsContent>

          <TabsContent value="guide" className="mt-0 focus-visible:outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-6 rounded-[40px] border border-border/40 bg-card/20 p-8 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-black tracking-tight">Arena Masterclass</h3>
                </div>
                
                <div className="space-y-4">
                  <GuideItem 
                    number="01" 
                    title="Choose Your Match" 
                    description="Select between Time Trials (race the clock) or Profit Targets (hit the goal first). Ranked matches affect your HIVE Rating." 
                  />
                  <GuideItem 
                    number="02" 
                    title="Lock In & Ready" 
                    description="Join the lobby, configure your charts, and click 'Ready to Fight'. Once enough players are ready, the countdown begins." 
                  />
                  <GuideItem 
                    number="03" 
                    title="Trade Under Pressure" 
                    description="Execute your plan within the rules. Watch the live leaderboard on the right rail to see where you stand in real-time." 
                  />
                  <GuideItem 
                    number="04" 
                    title="Climb the Ranks" 
                    description="Win matches to earn Rank Points (RP) and move from Initiate up to the Sovereign tier for exclusive rewards." 
                  />

                </div>
              </div>

              <div className="flex flex-col gap-6 rounded-[40px] border border-border/40 bg-card/20 p-8 backdrop-blur-xl">
                <div className="aspect-video w-full overflow-hidden rounded-[32px] border border-border/60 bg-muted/20 shadow-2xl relative group">
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end p-6">
                    <div className="space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary">Video Guide</div>
                      <div className="text-sm font-bold italic">Mastering the Arena Workspace</div>
                    </div>
                  </div>
                  <div className="flex h-full w-full items-center justify-center group-hover:scale-110 transition-transform duration-500">
                    <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40 text-primary">
                      <Play className="h-6 w-6 fill-primary" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Season 1 Rewards</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl border border-border/40 bg-background/40">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Top 3</div>
                      <div className="text-xs font-bold">Legendary Badge & 5k XP</div>
                    </div>
                    <div className="p-4 rounded-2xl border border-border/40 bg-background/40">
                      <div className="text-[10px] font-black uppercase tracking-widest text-warning mb-1">Sovereign</div>
                      <div className="text-xs font-bold">Founder's Skin & 10k XP</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </div>

      <Suspense fallback={<div className="hidden w-80 animate-pulse rounded-3xl bg-muted/20 xl:block" />}>
        <LobbyRightRail />
      </Suspense>
    </div>
  );
}

const Zap = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

function GuideItem({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="text-xl font-black text-primary/20 italic tabular-nums">{number}</div>
      <div className="space-y-1">
        <h4 className="text-sm font-bold uppercase tracking-wide">{title}</h4>
        <p className="text-xs text-muted-foreground font-medium leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

