/**
 * Global keyboard shortcuts for the Trading Workspace.
 *   B  buy quick action
 *   S  sell quick action
 *   X  close focused/last position
 *   C  cancel all pending orders (with confirm)
 *   R  toggle replay panel
 *   P  screenshot current chart
 *   H  hide/show drawings & overlays
 * Shortcuts are ignored while typing in inputs/textareas or when a
 * modifier key is held.
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
