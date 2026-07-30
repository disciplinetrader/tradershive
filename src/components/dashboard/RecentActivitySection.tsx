/**
 * Recent activity — one place for "what have I been doing?".
 *
 * Consolidates three previously scattered surfaces (recent trades, replay
 * sessions, journal reminders) into a single tabbed block. Nothing is
 * removed; the surfaces simply share one container instead of three cards.
 */

import { Link } from "@tanstack/react-router";
import { BookOpen, Clock, History, ListChecks, PlayCircle } from "lucide-react";

import { SectionHeader, Surface } from "@/components/ds";
import { ActionItemsList } from "@/components/dashboard/ActionItemsList";
import { RecentTrades } from "@/components/dashboard/RecentTrades";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HeroState } from "@/lib/dashboard-hero.functions";
import type { HomeActionItem } from "@/lib/dashboard-home.functions";

type Props = {
  hero?: HeroState;
  actions: HomeActionItem[];
};

function relTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function RecentActivitySection({ hero, actions }: Props) {
  const replay = hero?.lastReplay ?? null;
  const reminders = actions.length;

  return (
    <section className="space-y-3">
      <SectionHeader title="Recent activity" description="Trades, replays and follow-ups" icon={History} />

      <Tabs defaultValue="trades">
        <TabsList>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="replay">Replay</TabsTrigger>
          <TabsTrigger value="reminders">
            Reminders
            {reminders > 0 ? (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] tabular-nums">
                {reminders}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trades" className="mt-3">
          <Surface>
            <RecentTrades />
          </Surface>
        </TabsContent>

        <TabsContent value="replay" className="mt-3">
          {replay ? (
            <Surface className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <PlayCircle className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {replay.symbol ?? "Replay session"}
                    {replay.timeframe ? ` · ${replay.timeframe}` : ""}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    {replay.completionPct > 0 ? `${replay.completionPct.toFixed(0)}% complete` : "Not started"}
                    {relTime(replay.updatedAt) ? ` · ${relTime(replay.updatedAt)}` : ""}
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to="/replay">Resume</Link>
              </Button>
            </Surface>
          ) : (
            <EmptyState
              compact
              icon={PlayCircle}
              title="No replay sessions yet"
              description="Practise real setups on historical data — no risk, no waiting for the market."
              action={{ label: "Start a replay", href: "/replay" }}
            />
          )}
        </TabsContent>

        <TabsContent value="reminders" className="mt-3">
          {reminders > 0 ? (
            <ActionItemsList items={actions} hideHeader />
          ) : (
            <EmptyState
              compact
              tone="success"
              icon={ListChecks}
              title="Nothing outstanding"
              description="Every trade is journalled and no rules are breached. Trade clean."
              action={{ label: "Open journal", href: "/journal" }}
            />
          )}
        </TabsContent>
      </Tabs>

      <p className="sr-only">
        <BookOpen className="h-3 w-3" aria-hidden /> Journal reminders are listed in the Reminders tab.
      </p>
    </section>
  );
}
