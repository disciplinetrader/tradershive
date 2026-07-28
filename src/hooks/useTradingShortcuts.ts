/**
 * Global keyboard shortcuts for the Trading Workspace.
 * The `WORKSPACE_SHORTCUTS` map is the single source of truth used by both
 * this hook and the in-workspace shortcut sheet so the two can't drift.
 *
 * Shortcuts are ignored while typing in inputs/textareas or when a modifier
 * key is held (except the documented Ctrl/⌘+Enter submit).
 */
import { useEffect } from "react";

export type ShortcutHandlers = {
  onBuy?: () => void;
  onSell?: () => void;
  onClose?: () => void;
  onCancelOrders?: () => void;
  onToggleReplay?: () => void;
  onScreenshot?: () => void;
  onToggleDrawings?: () => void;
  onPlanTrade?: () => void;
};

export type ShortcutEntry = { key: string; label: string };

export const WORKSPACE_SHORTCUTS: ShortcutEntry[] = [
  { key: "F", label: "Focus Mode" },
  { key: "Esc", label: "Exit Focus" },
  { key: "B", label: "Focus Buy" },
  { key: "S", label: "Focus Sell" },
  { key: "J", label: "Open Journal panel" },
  { key: "T", label: "Plan Trade tool" },
  { key: "X", label: "Close last position" },
  { key: "P", label: "Screenshot" },
  { key: "H", label: "Hide overlays" },
  { key: "?", label: "Toggle this help" },
  { key: "⌘/Ctrl+↵", label: "Submit order" },
];

export function useTradingShortcuts(h: ShortcutHandlers) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      switch (k) {
        case "b": h.onBuy?.(); break;
        case "s": h.onSell?.(); break;
        case "x": h.onClose?.(); break;
        case "c": h.onCancelOrders?.(); break;
        case "r": h.onToggleReplay?.(); break;
        case "p": h.onScreenshot?.(); break;
        case "h": h.onToggleDrawings?.(); break;
        case "t": h.onPlanTrade?.(); break;
        default: return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);
}
