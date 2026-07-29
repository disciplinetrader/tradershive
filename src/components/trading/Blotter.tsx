/**
 * Blotter — unified position/order/history view for the bottom dock.
 *
 * Replaces the separate Positions / Orders / History tabs with one
 * filter-chip surface. Only the table matching the active filter is
 * mounted, so the inactive datasets do not fetch or poll.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { PositionsTable } from "@/components/paper-trading/PositionsTable";
import { OrdersTable } from "@/components/paper-trading/OrdersTable";
import { HistoryTable } from "@/components/paper-trading/HistoryTable";
import { usePaper } from "@/components/paper-trading/context";
import { listTrades, listOrders } from "@/lib/paper-trading.functions";
import type { BlotterFilter } from "@/hooks/use-workspace-prefs";

const CHIPS: { k: BlotterFilter; label: string }[] = [
  { k: "open", label: "Open" },
  { k: "pending", label: "Pending" },
  { k: "closed", label: "Closed" },
  { k: "all", label: "All" },
];

export function Blotter({
  filter,
  onFilterChange,
}: {
  filter: BlotterFilter;
  onFilterChange: (f: BlotterFilter) => void;
}) {
  const { accountId } = usePaper();
  const fetchTrades = useServerFn(listTrades);
  const fetchOrders = useServerFn(listOrders);

  // Lightweight badge counts — reuses cached queries other components already
  // populate (identical query keys), so this does not add new network traffic
  // when Positions/Orders panels are open elsewhere.
  const openQ = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => fetchTrades({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<unknown[]>,
    enabled: !!accountId,
    staleTime: 4_000,
    refetchIntervalInBackground: false,
  });
  const pendingQ = useQuery({
    queryKey: ["paper", "orders", accountId],
    queryFn: () => fetchOrders({ data: { account_id: accountId! } }) as unknown as Promise<unknown[]>,
    enabled: !!accountId,
    staleTime: 4_000,
    refetchIntervalInBackground: false,
  });

  const counts = useMemo(() => ({
    open: openQ.data?.length ?? 0,
    pending: pendingQ.data?.length ?? 0,
  }), [openQ.data, pendingQ.data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="Blotter filter"
        className="flex items-center gap-1 border-b border-border/40 px-3 py-1.5"
      >
        {CHIPS.map((c) => {
          const active = filter === c.k;
          const badge = c.k === "open" ? counts.open : c.k === "pending" ? counts.pending : null;
          return (
            <button
              key={c.k}
              role="tab"
              aria-selected={active}
              aria-controls="blotter-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => onFilterChange(c.k)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const i = CHIPS.findIndex((x) => x.k === filter);
                  const next = e.key === "ArrowRight" ? (i + 1) % CHIPS.length : (i - 1 + CHIPS.length) % CHIPS.length;
                  onFilterChange(CHIPS[next].k);
                  e.preventDefault();
                }
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.label}
              {badge != null && badge > 0 && (
                <span className={cn(
                  "rounded-full px-1 text-[9px] tabular-nums",
                  active ? "bg-primary/20" : "bg-muted-foreground/15",
                )}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div id="blotter-panel" role="tabpanel" className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        {filter === "open" && <PositionsTable />}
        {filter === "pending" && <OrdersTable />}
        {filter === "closed" && <HistoryTable />}
        {filter === "all" && (
          <div className="space-y-4">
            <Section title="Open positions"><PositionsTable /></Section>
            <Section title="Pending orders"><OrdersTable /></Section>
            <Section title="Closed trades"><HistoryTable /></Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
