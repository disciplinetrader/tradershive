/**
 * REPLAY STUDIO X — Phase 2 · Chart trading hotkeys.
 *
 * Terminal-grade keyboard coverage for chart-native order entry. Active
 * only while Chart Trading is the selected interaction mode, so the
 * playback hotkeys keep their meaning in Panel Trading mode.
 *
 *   B              arm / flip a Buy draft
 *   S              arm / flip a Sell draft
 *   Esc            cancel the draft (or deselect the position)
 *   Enter          confirm the draft
 *   X              close the selected (or only) position
 *   R              reverse the selected (or only) position
 *   E              move the selected position's stop to break-even
 *   Shift + ↑/↓    fine-adjust the draft entry
 *   Alt  + ↑/↓     fine-adjust the draft stop
 *   Alt  + Shift + ↑/↓  fine-adjust the draft target
 */
import { useEffect } from "react";
import { fineStep } from "@/lib/replay/chart-trading";
import { useReplay } from "../context";
import { useChartTrading } from "./chart-trading-context";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function useChartTradingHotkeys(active: boolean) {
  const { openTrades, closeTrade, reversePosition, moveToBreakEven } = useReplay();
  const { draft, arm, moveLevel, cancel, confirm, selectedId, select, unit, price } = useChartTrading();

  useEffect(() => {
    if (!active) return;

    const targetTrade = () =>
      openTrades.find((t) => t.id === selectedId) ?? (openTrades.length === 1 ? openTrades[0] : null);

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey) return;
      const key = e.key;

      if (key === "b" || key === "B") { e.preventDefault(); arm("long"); return; }
      if (key === "s" || key === "S") { e.preventDefault(); arm("short"); return; }

      if (key === "Escape") {
        if (draft) { e.preventDefault(); cancel(); }
        else if (selectedId) { e.preventDefault(); select(null); }
        return;
      }

      if (key === "Enter" && draft) { e.preventDefault(); void confirm(); return; }

      if (key === "x" || key === "X") {
        const t = targetTrade();
        if (t) { e.preventDefault(); void closeTrade(t.id); }
        return;
      }
      if (key === "r" || key === "R") {
        const t = targetTrade();
        if (t) { e.preventDefault(); void reversePosition(t.id); }
        return;
      }
      if (key === "e" || key === "E") {
        const t = targetTrade();
        if (t) { e.preventDefault(); void moveToBreakEven(t.id); }
        return;
      }

      // Fine adjustment — only meaningful with a live draft.
      if (draft && (key === "ArrowUp" || key === "ArrowDown")) {
        const dir = key === "ArrowUp" ? 1 : -1;
        const step = fineStep(price || draft.entry, unit) * dir;
        if (e.altKey && e.shiftKey) {
          if (draft.tp != null) { e.preventDefault(); moveLevel("tp", draft.tp + step); }
          return;
        }
        if (e.altKey) {
          if (draft.sl != null) { e.preventDefault(); moveLevel("sl", draft.sl + step); }
          return;
        }
        if (e.shiftKey) { e.preventDefault(); moveLevel("entry", draft.entry + step); }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    active, draft, arm, cancel, confirm, moveLevel, selectedId, select,
    openTrades, closeTrade, reversePosition, moveToBreakEven, unit, price,
  ]);
}

export const CHART_TRADING_SHORTCUTS: Array<[string, string]> = [
  ["B / S", "Arm a Buy / Sell order on the chart"],
  ["Enter", "Confirm the armed order"],
  ["Esc", "Cancel the armed order"],
  ["X", "Close selected position"],
  ["R", "Reverse selected position"],
  ["E", "Move stop to break-even"],
  ["Shift + ↑/↓", "Fine-adjust entry"],
  ["Alt + ↑/↓", "Fine-adjust stop"],
  ["Alt + Shift + ↑/↓", "Fine-adjust target"],
  ["Alt + click chart", "Arm an order at that price"],
];
