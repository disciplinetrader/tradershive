/**
 * Drawing store — plain observable state with undo/redo and per-symbol
 * localStorage persistence. Deliberately React-free so pointer drags can
 * mutate at 60fps and repaint through the chart primitive without any
 * React re-render.
 */

import { DEFAULT_STYLE, type Drawing, type DrawingStyle, type ToolId } from "./types";

type Listener = () => void;

export interface DrawingSnapshot {
  drawings: Drawing[];
  selectedId: string | null;
}

const MAX_HISTORY = 60;

function storageKey(scope: string) {
  return `thive.chart.drawings.${scope}`;
}

export class DrawingStore {
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private undoStack: Drawing[][] = [];
  private redoStack: Drawing[][] = [];
  private listeners = new Set<Listener>();
  private clipboard: Drawing | null = null;
  private scope = "default";

  /** Transient drawing being created (not yet committed). */
  draft: Drawing | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const l of this.listeners) l(); }

  private clone(list: Drawing[]) {
    return list.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })), style: { ...d.style } }));
  }

  private pushHistory() {
    this.undoStack.push(this.clone(this.drawings));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  list() { return this.drawings; }
  selected() { return this.drawings.find((d) => d.id === this.selectedId) ?? null; }
  selectedIdValue() { return this.selectedId; }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  hasClipboard() { return !!this.clipboard; }

  setScope(scope: string) {
    if (scope === this.scope) return;
    this.persist();
    this.scope = scope;
    this.drawings = this.read();
    this.selectedId = null;
    this.hoveredId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  private read(): Drawing[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey(this.scope));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Drawing[]) : [];
    } catch { return []; }
  }

  persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(this.scope), JSON.stringify(this.drawings));
    } catch { /* quota */ }
  }

  hydrate(scope: string) {
    this.scope = scope;
    this.drawings = this.read();
    this.emit();
  }

  select(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit();
  }

  /** Transient hover highlight — never persisted, never part of history. */
  hoveredIdValue() { return this.hoveredId; }
  setHovered(id: string | null) {
    if (this.hoveredId === id) return;
    this.hoveredId = id;
    this.emit();
  }

  setHidden(id: string, hidden: boolean) {
    this.pushHistory();
    this.drawings = this.drawings.map((d) => (d.id === id ? { ...d, hidden } : d));
    this.persist();
    this.emit();
  }

  add(d: Drawing) {
    this.pushHistory();
    this.drawings = [...this.drawings, d];
    this.selectedId = d.id;
    this.persist();
    this.emit();
  }

  /** Live-drag update; history is captured once via beginEdit(). */
  patch(id: string, partial: Partial<Drawing>, options: { history?: boolean } = {}) {
    if (options.history) this.pushHistory();
    this.drawings = this.drawings.map((d) => (d.id === id ? { ...d, ...partial } : d));
    this.emit();
  }

  beginEdit() { this.pushHistory(); }
  commit() { this.persist(); this.emit(); }

  remove(id: string) {
    this.pushHistory();
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    if (this.hoveredId === id) this.hoveredId = null;
    this.persist();
    this.emit();
  }

  removeAll() {
    if (!this.drawings.length) return;
    this.pushHistory();
    this.drawings = [];
    this.selectedId = null;
    this.persist();
    this.emit();
  }

  setAllLocked(locked: boolean) {
    this.pushHistory();
    this.drawings = this.drawings.map((d) => ({ ...d, locked }));
    this.persist();
    this.emit();
  }

  setAllHidden(hidden: boolean) {
    this.pushHistory();
    this.drawings = this.drawings.map((d) => ({ ...d, hidden }));
    this.persist();
    this.emit();
  }

  duplicate(id: string) {
    const src = this.drawings.find((d) => d.id === id);
    if (!src) return;
    const copy = this.offsetCopy(src);
    this.add(copy);
  }

  copy(id: string) {
    const src = this.drawings.find((d) => d.id === id);
    this.clipboard = src ? this.clone([src])[0] : null;
    this.emit();
  }

  paste() {
    if (!this.clipboard) return;
    this.add(this.offsetCopy(this.clipboard));
  }

  private offsetCopy(src: Drawing): Drawing {
    const span = src.points.length > 1 ? Math.abs(src.points[1].time - src.points[0].time) : 0;
    const shift = span || 0;
    return {
      ...src,
      id: newId(),
      createdAt: Date.now(),
      points: src.points.map((p) => ({ time: p.time + shift, price: p.price })),
      style: { ...src.style },
    };
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.clone(this.drawings));
    this.drawings = prev;
    if (this.selectedId && !this.drawings.some((d) => d.id === this.selectedId)) this.selectedId = null;
    this.persist();
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.clone(this.drawings));
    this.drawings = next;
    this.persist();
    this.emit();
  }
}

export function newId() {
  return `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function makeDrawing(kind: Drawing["kind"], points: Drawing["points"], style?: Partial<DrawingStyle>): Drawing {
  return {
    id: newId(),
    kind,
    points,
    style: { ...DEFAULT_STYLE, ...style },
    createdAt: Date.now(),
  };
}

/** Favourite tools — persisted locally until user-level prefs exist. */
const FAV_KEY = "thive.chart.tools.favourites";
export function readFavourites(): ToolId[] {
  if (typeof window === "undefined") return ["trend_line", "horizontal_line", "fib_retracement", "long_position"];
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    if (!raw) return ["trend_line", "horizontal_line", "fib_retracement", "long_position"];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ToolId[]) : [];
  } catch { return []; }
}
export function writeFavourites(list: ToolId[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
