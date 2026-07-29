/**
 * Central chart-keyboard registry.
 *
 * Hosts TradingView-style navigation shortcuts and undo/redo. Ignores events
 * that originate inside text inputs, textareas, comboboxes, or editable
 * elements. Consumers pass callbacks — no direct DOM coupling to specific
 * chart adapters.
 */
import { useEffect } from "react";

export type ChartKeyboardHandlers = {
  zoomIn?: () => void;
  zoomOut?: () => void;
  panLeft?: () => void;
  panRight?: () => void;
  panLeftFast?: () => void;
  panRightFast?: () => void;
  undo?: () => void;
  redo?: () => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute("role") === "combobox" || el.getAttribute("role") === "textbox") return true;
  return false;
}

export function useChartKeyboard(handlers: ChartKeyboardHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && (e.key === "z" || e.key === "Z")) {
        if (e.shiftKey) { handlers.redo?.(); }
        else { handlers.undo?.(); }
        e.preventDefault();
        return;
      }

      // Bare number-row + / = / -
      if (!meta && (e.key === "+" || e.key === "=")) { handlers.zoomIn?.(); return; }
      if (!meta && (e.key === "-" || e.key === "_")) { handlers.zoomOut?.(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
