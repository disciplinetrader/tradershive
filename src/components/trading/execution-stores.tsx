import { createContext, useContext, type ReactNode } from "react";

import type { PositionOrderStore } from "@/lib/chart/orders/store";
import type { ClosedTradeStore } from "@/lib/chart/orders/trade-store";

/**
 * Optional isolated execution stores for a `TradingWorkspace`.
 *
 * Live trading leaves this unset and the workspace uses the process-wide
 * singletons (`positionOrderStore` / `closedTradeStore`), which is correct:
 * one live market, one order book, shared across every chart on the page.
 *
 * A replay battle must NOT share those. The replay clock and the live market
 * feed both drive `runObservation`, so pointing both at the singletons
 * interleaves two different markets into one order book — a live tick could
 * fill an order placed against 2023 candles. `ReplaySessionEngine` already
 * builds per-session store instances for exactly this reason
 * (`replay/session/loader.ts`); this context is how they reach the workspace.
 *
 * Whoever provides stores here owns their remote wiring and scoping —
 * `usePositionOrders` deliberately does not attach remotes to injected stores.
 */
export interface ExecutionStores {
  orders: PositionOrderStore;
  trades: ClosedTradeStore;
}

const ExecutionStoresContext = createContext<ExecutionStores | null>(null);

export function ExecutionStoresProvider({
  value,
  children,
}: {
  value: ExecutionStores | null;
  children: ReactNode;
}) {
  return (
    <ExecutionStoresContext.Provider value={value}>{children}</ExecutionStoresContext.Provider>
  );
}

/** `null` means "use the live singletons" — the default for ordinary trading. */
export function useExecutionStores(): ExecutionStores | null {
  return useContext(ExecutionStoresContext);
}
