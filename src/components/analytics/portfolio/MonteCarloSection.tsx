/**
 * §H Monte Carlo — forward risk on the filtered sample.
 *
 * Nothing but the workspace adapter: it reads the filtered records out of
 * context and hands them to the shared `MonteCarloPanel`, which Replay Review
 * mounts too. Keep it that way — a second copy of the panel would be a second
 * set of projection semantics.
 */

import { useMemo } from "react";
import { MonteCarloPanel } from "../MonteCarloPanel";
import { useAnalyticsWorkspace } from "./provider";

export function MonteCarloSection() {
  const { result } = useAnalyticsWorkspace();

  const pnls = useMemo(() => result.records.map((r) => r.netPnl), [result.records]);

  return <MonteCarloPanel pnls={pnls} startingBalance={result.equity.startingBalance} />;
}
