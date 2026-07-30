/**
 * Replay Studio X — Command palette (Phase 1).
 *
 * ⌘K / Ctrl+K. Filterable list of existing workspace actions only — it
 * dispatches to the replay context, it never adds new behaviour.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useReplay } from "../context";
import { REPLAY_SHORTCUTS } from "./useReplayHotkeys";
import { CHART_TRADING_SHORTCUTS } from "./useChartTradingHotkeys";

export function ReplayCommandPalette({
  open,
  onOpenChange,
  onSnapshot,
  onFinish,
  onToggleDock,
  onToggleHud,
  onToggleTradeMode,
  onToggleTicket,
  tradeMode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSnapshot: () => void;
  onFinish: () => void;
  onToggleDock: () => void;
  onToggleHud: () => void;
  onToggleTradeMode?: () => void;
  onToggleTicket?: () => void;
  tradeMode?: "chart" | "panel";
}) {
  const { toggle, restart, replayAgain, jumpTo, fastForwardUntil, addCheckpoint, setSpeed } = useReplay();
  const [q, setQ] = useState("");

  useEffect(() => { if (!open) setQ(""); }, [open]);

  const commands = useMemo(
    () => [
      { label: "Play / Pause", run: toggle },
      { label: "Restart cursor", run: restart },
      { label: "Replay again (reset progress)", run: () => { replayAgain(); } },
      { label: "Snapshot chart", run: onSnapshot },
      { label: "Finish & review session", run: onFinish },
      { label: "Toggle bottom dock", run: onToggleDock },
      { label: "Toggle HUD overlay", run: onToggleHud },
      ...(onToggleTradeMode
        ? [{ label: `Switch to ${tradeMode === "chart" ? "panel" : "chart"} trading`, run: onToggleTradeMode }]
        : []),
      ...(onToggleTicket ? [{ label: "Toggle floating order ticket", run: onToggleTicket }] : []),
      { label: "Jump to London Open", run: () => jumpTo("london_open") },
      { label: "Jump to New York Open", run: () => jumpTo("ny_open") },
      { label: "Jump to Asia Open", run: () => jumpTo("asia_open") },
      { label: "Jump to next trade", run: () => jumpTo("next_trade") },
      { label: "Jump to next bookmark", run: () => jumpTo("next_bookmark") },
      { label: "Fast forward to next order trigger", run: () => fastForwardUntil("next_order_trigger") },
      { label: "Save checkpoint here", run: () => { addCheckpoint("custom", "Bookmark"); } },
      { label: "Set speed 1x", run: () => setSpeed(1) },
      { label: "Set speed 4x", run: () => setSpeed(4) },
      { label: "Set speed 16x", run: () => setSpeed(16) },
    ],
    [toggle, restart, replayAgain, onSnapshot, onFinish, onToggleDock, onToggleHud, onToggleTradeMode, onToggleTicket, tradeMode, jumpTo, fastForwardUntil, addCheckpoint, setSpeed],
  );

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-sm">Replay commands</DialogTitle>
        </DialogHeader>
        <div className="px-4">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command…"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                filtered[0].run();
                onOpenChange(false);
              }
            }}
          />
        </div>
        <ul className="max-h-[300px] overflow-auto px-2 pb-3 pt-2">
          {filtered.map((c) => (
            <li key={c.label}>
              <button
                className="w-full rounded-[3px] px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => { c.run(); onOpenChange(false); }}
              >
                {c.label}
              </button>
            </li>
          ))}
          {!filtered.length ? (
            <li className="px-2 py-3 text-xs text-muted-foreground">No matching command.</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Keyboard shortcut sheet (`?`). */
export function ReplayShortcutSheet({
  open,
  onOpenChange,
  chartTrading = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chartTrading?: boolean;
}) {
  const rows = chartTrading ? [...CHART_TRADING_SHORTCUTS, ...REPLAY_SHORTCUTS] : REPLAY_SHORTCUTS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-sm overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {rows.map(([keys, label]) => (
            <li key={keys} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{label}</span>
              <kbd className="rounded border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
