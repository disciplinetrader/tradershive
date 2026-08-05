/**
 * Recent activity — one table, three tabs.
 *
 * Replaces three separate widgets (recent trades, replay sessions, journal
 * reminders) with a single scannable table.
 */

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, LineChart, PlayCircle } from "lucide-react";

import { Panel } from "@/components/dashboard/v2/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDashboardOverview } from "@/lib/dashboard.functions";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { listReplaySessions } from "@/lib/replay.functions";
import { cn } from "@/lib/utils";
import { useSessionContext } from "@/hooks/use-session-context";

type Row = {
  id: string;
  primary: string;
  secondary: string;
  meta: string;
  value: string;
  tone: "up" | "down" | "flat";
  href: string;
};

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "—";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function ActivityTable() {
  const fetchOverview = useServerFn(getDashboardOverview);
  const fetchReplays = useServerFn(listReplaySessions);

  const { data: overview, isPending: tradesPending } = useQuery({
    queryKey: ["dashboard_overview"],
    queryFn: () => fetchOverview(),
    staleTime: 30_000,
  });
  const { data: replays, isPending: replayPending } = useQuery({
    queryKey: ["replay", "sessions"],
    queryFn: () => fetchReplays(),
    staleTime: 60_000,
  });
  const { data: entries, isPending: journalPending } = useQuery({
    queryKey: journalKeys.list(),
    queryFn: fetchEntries,
    staleTime: 60_000,
  });

  const tradeRows: Row[] = useMemo(
    () =>
      (overview?.recentTrades ?? []).slice(0, 8).map((t) => ({
        id: t.id,
        primary: t.pair,
        secondary: t.direction === "long" ? "Long" : "Short",
        meta: relTime(t.openedAt),
        value: `${t.pnl >= 0 ? "+" : "−"}$${Math.abs(t.pnl).toFixed(2)}`,
        tone: t.pnl > 0 ? "up" : t.pnl < 0 ? "down" : "flat",
        href: "/journal",
      })),
    [overview],
  );

  const replayRows: Row[] = useMemo(
    () =>
      (replays ?? []).slice(0, 8).map((r: any) => ({
        id: r.id,
        primary: r.symbol ?? "Replay session",
        secondary: r.timeframe ?? r.status ?? "session",
        meta: relTime(r.last_opened_at ?? r.updated_at ?? r.created_at),
        value: `${Math.round(Number(r.completion_pct ?? 0))}%`,
        tone: "flat" as const,
        href: "/replay",
      })),
    [replays],
  );

  const journalRows: Row[] = useMemo(
    () =>
      (entries ?? []).slice(0, 8).map((e) => ({
        id: e.id,
        primary: e.symbol ?? "Journal entry",
        secondary: e.status === "draft" ? "Draft" : "Published",
        meta: relTime(e.closed_at ?? e.created_at),
        value: e.rr != null ? `${Number(e.rr).toFixed(2)}R` : "—",
        tone: (e.pnl ?? 0) > 0 ? "up" : (e.pnl ?? 0) < 0 ? "down" : "flat",
        href: "/journal",
      })),
    [entries],
  );

  return (
    <Panel flush className="overflow-hidden">
      <Tabs defaultValue="trades">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
          <TabsList className="rounded-xl">
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="replay">Replay</TabsTrigger>
            <TabsTrigger value="journal">Journal</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="trades" className="mt-4">
          <Body
            pending={tradesPending}
            rows={tradeRows}
            empty={{
              icon: LineChart,
              title: "No trades yet",
              description: "Open your first position in the workspace and it will appear here.",
              action: { label: "Start Trading", href: "/trading" },
            }}
          />
        </TabsContent>
        <TabsContent value="replay" className="mt-4">
          <Body
            pending={replayPending}
            rows={replayRows}
            empty={{
              icon: PlayCircle,
              title: "No replay sessions",
              description: "Practise real setups on historical data — no risk, no waiting.",
              action: { label: "Start Replay", href: "/replay" },
            }}
          />
        </TabsContent>
        <TabsContent value="journal" className="mt-4">
          <Body
            pending={journalPending}
            rows={journalRows}
            empty={{
              icon: BookOpen,
              title: "Nothing journalled yet",
              description: "Write down why you took the trade while it is still fresh.",
              action: { label: "Add Journal Entry", href: "/journal" },
            }}
          />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function Body({
  pending,
  rows,
  empty,
}: {
  pending: boolean;
  rows: Row[];
  empty: { icon: any; title: string; description: string; action: { label: string; href: string } };
}) {
  if (pending) {
    return (
      <div className="space-y-2 px-5 pb-5 sm:px-6 sm:pb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-5 pb-6 sm:px-6">
        <EmptyState compact {...empty} />
      </div>
    );
  }

  return (
    <div className="pb-2">
      {rows.map((r) => (
        <Link
          key={r.id}
          to={r.href}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 sm:px-6"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.primary}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.secondary} · {r.meta}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              r.tone === "up" && "text-success",
              r.tone === "down" && "text-danger",
            )}
          >
            {r.value}
          </span>
        </Link>
      ))}
    </div>
  );
}
