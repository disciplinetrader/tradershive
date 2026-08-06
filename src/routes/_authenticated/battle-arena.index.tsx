import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RankingCard } from "@/components/battle-arena/lobby/RankingCard";
import { LobbyRightRail } from "@/components/battle-arena/lobby/LobbyRightRail";
import { BattleList } from "@/components/battle-arena/lobby/BattleList";
import { Swords, History, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

import { CardGridSkeleton } from "@/components/ui/skeletons";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [activeTab, setActiveTab] = useState("all");


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
              and earn Ranking Points by outperforming the market and your peers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-2xl border-border/40 bg-card/20 font-black uppercase tracking-widest backdrop-blur-md hover:bg-card/40"
              onClick={() => {/* Join Random logic */}}
            >
              <Zap className="mr-2 h-4 w-4 fill-primary text-primary" /> Join Random
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
            <div className="flex flex-col items-center gap-6 rounded-[40px] border border-border/40 bg-card/20 px-6 py-16 text-center backdrop-blur-xl">
              <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-primary/10 text-primary">
                <Sparkles className="h-8 w-8" />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-xl font-black tracking-tight">Arena Masterclass</h3>
                <p className="text-sm text-muted-foreground font-medium">
                  Learn how to master the arena, manage your risk, and climb the tiers efficiently.
                </p>
              </div>
              <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-[32px] border border-border/60 bg-muted/20 shadow-2xl">
                <div className="flex h-full w-full items-center justify-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground/20" />
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
