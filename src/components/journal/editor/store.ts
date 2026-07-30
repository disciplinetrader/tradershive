/**
 * Global open/close channel for the unified trade editor.
 *
 * Any surface (table row, calendar rail, analytics drill-down, keyboard
 * shortcut) calls `openTradeEditor(...)`. A single host — mounted once in the
 * journal layout — renders the actual editor, so there is exactly one editing
 * implementation on screen at any time.
 */
import { useSyncExternalStore } from "react";
import type { SectionId } from "@/lib/journal/editor/model";

export type EditorMode = "quick" | "full";

export type EditorRequest = {
  entryId: string;
  mode: EditorMode;
  section?: SectionId;
} | null;

let state: EditorRequest = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function openTradeEditor(entryId: string, mode: EditorMode = "full", section?: SectionId) {
  state = { entryId, mode, section };
  emit();
}

export function closeTradeEditor() {
  if (!state) return;
  state = null;
  emit();
}

export function setTradeEditorMode(mode: EditorMode) {
  if (!state) return;
  state = { ...state, mode };
  emit();
}

export function useTradeEditorRequest(): EditorRequest {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => null,
  );
}

/* --- last open section, remembered per user (not per trade) --- */

const SECTION_KEY = "th_trade_editor_section";

export function loadLastSection(): SectionId {
  if (typeof window === "undefined") return "trade";
  return (localStorage.getItem(SECTION_KEY) as SectionId | null) ?? "trade";
}

export function saveLastSection(id: SectionId) {
  try {
    localStorage.setItem(SECTION_KEY, id);
  } catch {
    /* private mode */
  }
}

/* --- local draft safety net for unsaved text --- */

const draftKey = (id: string) => `th_trade_editor_draft_${id}`;

export function saveLocalDraft(entryId: string, patch: Record<string, unknown>) {
  try {
    if (!Object.keys(patch).length) {
      localStorage.removeItem(draftKey(entryId));
      return;
    }
    localStorage.setItem(draftKey(entryId), JSON.stringify({ at: Date.now(), patch }));
  } catch {
    /* quota */
  }
}

export function loadLocalDraft(entryId: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(draftKey(entryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; patch: Record<string, unknown> };
    // Anything older than a day is stale enough to ignore.
    if (Date.now() - parsed.at > 86_400_000) return null;
    return parsed.patch ?? null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(entryId: string) {
  try {
    localStorage.removeItem(draftKey(entryId));
  } catch {
    /* ignore */
  }
}
