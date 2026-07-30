/**
 * "E" opens the unified trade editor for the trade currently in focus.
 * Ignored while typing so it can never hijack a note being written.
 */
import { useEffect } from "react";
import { openTradeEditor, type EditorMode } from "./store";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

export function useTradeEditorShortcut(entryId: string | null, mode: EditorMode = "full") {
  useEffect(() => {
    if (!entryId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      openTradeEditor(entryId, mode);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entryId, mode]);
}
