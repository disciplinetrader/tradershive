/**
 * Inline chart text editor.
 *
 * Renders a compact textarea anchored to the clicked chart coordinate. The
 * value is bound through React state and painted to canvas as plain text, so
 * markup can never be interpreted — there is no innerHTML path anywhere in
 * the text lifecycle.
 *
 * Keyboard contract:
 *   Enter        → confirm
 *   Shift+Enter  → newline
 *   Escape       → cancel (creation) / exit without corrupting (editing)
 * Every key is stopped from propagating so chart and trading shortcuts stay
 * inert while typing.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEXT_LIMITS } from "@/lib/chart/drawings/types";
import type { TextEditorState } from "@/components/chart/useChartDrawings";

interface Props {
  state: TextEditorState;
  onChange: (patch: Partial<TextEditorState>) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** Size of the chart element, used to keep the editor on screen. */
  bounds: { width: number; height: number };
}

const EDITOR_W = 236;

export function ChartTextEditor({ state, onChange, onCommit, onCancel, bounds }: Props) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(state.value);
  // Committing on blur must not double-fire when Enter already committed.
  const settled = useRef(false);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Keep the panel inside the chart, and above the mobile keyboard.
  const [pos, setPos] = useState({ left: state.x, top: state.y });
  useEffect(() => {
    const el = areaRef.current?.parentElement;
    const h = el?.offsetHeight ?? 120;
    const left = Math.max(8, Math.min(state.x, Math.max(8, bounds.width - EDITOR_W - 8)));
    let top = state.y - h / 2;
    top = Math.max(8, Math.min(top, Math.max(8, bounds.height - h - 8)));
    setPos({ left, top });
  }, [state.x, state.y, bounds.width, bounds.height, value]);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  const step = (delta: number) =>
    onChange({
      fontSize: Math.min(
        TEXT_LIMITS.maxFontSize,
        Math.max(TEXT_LIMITS.minFontSize, state.fontSize + delta),
      ),
    });

  const aligns: Array<{ id: TextEditorState["align"]; Icon: typeof AlignLeft }> = [
    { id: "left", Icon: AlignLeft },
    { id: "center", Icon: AlignCenter },
    { id: "right", Icon: AlignRight },
  ];

  return (
    <div
      data-typing-surface="true"
      data-testid="chart-text-editor"
      className="absolute z-50 rounded-lg border border-border bg-popover p-1.5 shadow-xl"
      style={{ left: pos.left, top: pos.top, width: EDITOR_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={areaRef}
        value={value}
        rows={Math.min(TEXT_LIMITS.maxLines, Math.max(1, value.split("\n").length))}
        maxLength={TEXT_LIMITS.maxChars}
        placeholder="Add a note…"
        aria-label="Chart text"
        className={cn(
          "w-full resize-none rounded-md border border-input bg-background px-2 py-1.5",
          "text-sm outline-none focus:ring-1 focus:ring-ring",
        )}
        style={{ fontSize: state.fontSize, textAlign: state.align }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        // Stop every key from reaching the chart/global shortcut listeners.
        onKeyUp={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5">
          {aligns.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={`Align ${id}`}
              aria-pressed={state.align === id}
              // Keep focus in the textarea so onBlur doesn't commit early.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange({ align: id })}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition",
                state.align === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Decrease text size"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(-2)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center font-mono text-[10px] text-muted-foreground">{state.fontSize}</span>
          <button
            type="button"
            aria-label="Increase text size"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(2)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-1 px-0.5 text-[10px] leading-tight text-muted-foreground">
        Enter to save · Shift+Enter new line · Esc to cancel
      </p>
    </div>
  );
}
