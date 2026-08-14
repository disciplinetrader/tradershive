/**
 * Chronological event log for a single trade — rendered from
 * `position_history`. Each entry has an icon, title, timestamp and a
 * short payload summary. Used inside PostTradeSummary and the trade
 * drawer.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Circle, Flag, PencilLine, Scissors, Shield, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTradeTimeline } from "@/lib/paper-trading.functions";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";

type Event = {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  opened: Flag,
  modified: PencilLine,
  break_even: Shield,
  partial_close: Scissors,
  note_added: StickyNote,
  closed: X,
};

const TITLES: Record<string, string> = {
  opened: "Trade opened",
  modified: "SL / TP modified",
  break_even: "Moved to break-even",
  partial_close: "Partial close",
  note_added: "Note added",
  closed: "Trade closed",
};

export function TradeTimeline({ tradeId, currency = "USD" }: { tradeId: string; currency?: string }) {
  const fetch = useServerFn(listTradeTimeline);
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["paper", "timeline", tradeId],
    queryFn: () => fetch({ data: { trade_id: tradeId } }) as unknown as Promise<Event[]>,
    enabled: !!tradeId,
  });

  // Guarded explicitly, because a disabled query sits in `isPending` forever
  // and would render the loading row for good — which is the exact failure
  // this component is being fixed for.
  if (!tradeId) return <div className="text-xs text-muted-foreground">No trade selected.</div>;

  // A failed fetch used to fall through to "No events recorded yet." — the
  // same shape as a trade that genuinely has no history, so a broken request
  // was indistinguishable from an empty one and there was no way to retry.
  if (isError) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-warning">
        <span>Couldn&apos;t load the timeline{(error as Error)?.message ? ` — ${(error as Error).message}` : ""}.</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => refetch()} disabled={isRefetching}>
          Retry
        </Button>
      </div>
    );
  }
  // `isPending` rather than `isLoading`: with no `tradeId` the query never
  // runs, and `isLoading` is false in that state, so the old code fell past
  // this branch and claimed the trade had no events.
  if (isPending) return <div className="text-xs text-muted-foreground">Loading timeline…</div>;
  const events = data ?? [];
  if (!events.length) return <div className="text-xs text-muted-foreground">No events recorded yet.</div>;

  return (
    <ol className="relative space-y-3 border-l border-border/60 pl-4">
      {events.map((e, i) => {
        const Icon = ICONS[e.event] ?? Circle;
        const title = TITLES[e.event] ?? e.event.replace(/_/g, " ");
        return (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="relative"
          >
            <span className="absolute -left-[22px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-border/70 bg-background">
              <Icon className={cn("h-2.5 w-2.5",
                e.event === "closed" ? "text-danger" :
                e.event === "opened" ? "text-primary" :
                e.event === "break_even" ? "text-success" : "text-muted-foreground")} />
            </span>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">{title}</span>
              <time className="tabular-nums text-[10px] text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </time>
            </div>
            <PayloadSummary event={e.event} payload={e.payload} currency={currency} />
          </motion.li>
        );
      })}
    </ol>
  );
}

function PayloadSummary({ event, payload, currency }: { event: string; payload: Record<string, unknown> | null; currency: string }) {
  if (!payload) return null;
  const p = payload as Record<string, number | string | null>;
  const parts: string[] = [];
  if (event === "opened") {
    if (p.entry_price != null) parts.push(`Entry ${p.entry_price}`);
    if (p.lot_size != null) parts.push(`${p.lot_size} lots`);
  } else if (event === "modified") {
    if (p.stop_loss != null) parts.push(`SL → ${p.stop_loss}`);
    if (p.take_profit != null) parts.push(`TP → ${p.take_profit}`);
  } else if (event === "break_even") {
    if (p.stop_loss != null) parts.push(`SL → ${p.stop_loss}`);
  } else if (event === "partial_close") {
    if (p.fraction != null) parts.push(`${Math.round(Number(p.fraction) * 100)}%`);
    if (p.exit_price != null) parts.push(`@ ${p.exit_price}`);
    if (p.pnl != null) parts.push(`P/L ${formatCurrency(Number(p.pnl), currency)}`);
  } else if (event === "closed") {
    if (p.exit_price != null) parts.push(`Exit ${p.exit_price}`);
    if (p.close_reason) parts.push(String(p.close_reason).replace(/_/g, " "));
    if (p.pnl != null) parts.push(`P/L ${formatCurrency(Number(p.pnl), currency)}`);
    if (p.duration_ms != null) parts.push(formatDur(Number(p.duration_ms)));
  } else if (event === "note_added") {
    if (p.note) parts.push(String(p.note));
  }
  if (!parts.length) return null;
  return <div className="mt-0.5 text-[11px] text-muted-foreground">{parts.join(" · ")}</div>;
}

function formatDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
