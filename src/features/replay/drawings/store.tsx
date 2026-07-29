/**
 * Drawing store — React context providing state + reducer + undo/redo
 * history + persistence. Persistence is debounced (200ms) to keep write
 * volume low during drag operations.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { loadDrawings, saveDrawings } from "./persistence";
import type { Drawing, DrawingTool } from "./types";

type State = {
  tool: DrawingTool;
  drawings: Drawing[];
  selectedId: string | null;
  past: Drawing[][];
  future: Drawing[][];
};

type Action =
  | { type: "hydrate"; drawings: Drawing[] }
  | { type: "setTool"; tool: DrawingTool }
  | { type: "add"; drawing: Drawing }
  | { type: "update"; id: string; patch: Partial<Drawing> }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

const HISTORY_LIMIT = 50;

function pushHistory(past: Drawing[][], drawings: Drawing[]): Drawing[][] {
  const next = [...past, drawings];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, drawings: action.drawings, past: [], future: [] };
    case "setTool":
      return { ...state, tool: action.tool, selectedId: action.tool === "cursor" ? state.selectedId : null };
    case "add": {
      const past = pushHistory(state.past, state.drawings);
      return { ...state, drawings: [...state.drawings, action.drawing], past, future: [], selectedId: action.drawing.id, tool: "cursor" };
    }
    case "update": {
      const past = pushHistory(state.past, state.drawings);
      const drawings = state.drawings.map((d) => (d.id === action.id ? ({ ...d, ...action.patch } as Drawing) : d));
      return { ...state, drawings, past, future: [] };
    }
    case "remove": {
      const past = pushHistory(state.past, state.drawings);
      return {
        ...state,
        drawings: state.drawings.filter((d) => d.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        past,
        future: [],
      };
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "undo": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        drawings: prev,
        past: state.past.slice(0, -1),
        future: [state.drawings, ...state.future],
        selectedId: null,
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        ...state,
        drawings: next,
        past: pushHistory(state.past, state.drawings),
        future: state.future.slice(1),
        selectedId: null,
      };
    }
    case "clear": {
      const past = pushHistory(state.past, state.drawings);
      return { ...state, drawings: [], selectedId: null, past, future: [] };
    }
    default:
      return state;
  }
}

const initial: State = { tool: "cursor", drawings: [], selectedId: null, past: [], future: [] };

type Ctx = State & {
  setTool: (t: DrawingTool) => void;
  addDrawing: (d: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  select: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const DrawingContext = createContext<Ctx | null>(null);

export function DrawingProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, initial);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;
    const drawings = loadDrawings(sessionId);
    dispatch({ type: "hydrate", drawings });
    hydratedRef.current = true;
  }, [sessionId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const handle = window.setTimeout(() => saveDrawings(sessionId, state.drawings), 200);
    return () => window.clearTimeout(handle);
  }, [sessionId, state.drawings]);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      setTool: (tool) => dispatch({ type: "setTool", tool }),
      addDrawing: (drawing) => dispatch({ type: "add", drawing }),
      updateDrawing: (id, patch) => dispatch({ type: "update", id, patch }),
      removeDrawing: (id) => dispatch({ type: "remove", id }),
      select: (id) => dispatch({ type: "select", id }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      clearAll: () => dispatch({ type: "clear" }),
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state],
  );

  return <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>;
}

export function useDrawings() {
  const v = useContext(DrawingContext);
  if (!v) throw new Error("useDrawings must be used within DrawingProvider");
  return v;
}

export function useOptionalDrawings() {
  return useContext(DrawingContext);
}

export function makeId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
