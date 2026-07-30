import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Lock, LockOpen, Settings2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DrawingStore } from "@/lib/chart/drawings/store";

const COLORS = ["#38bdf8", "#22c55e", "#ef4444", "#f59e0b", "#a855f7", "#e2e8f0"];
const WIDTHS = [1, 2, 3];
const LINE_STYLES: { id: 0 | 1 | 2; label: string }[] = [
  { id: 0, label: "Solid" },
  { id: 1, label: "Dashed" },
  { id: 2, label: "Dotted" },
];

interface Props {
  store: DrawingStore;
  menu: { id: string; x: number; y: number };
  onClose: () => void;
  /** Store revision so the menu re-renders after style/lock changes. */
  revision?: unknown;
}

/** Right-click menu for a chart drawing: settings, duplicate, lock, delete. */
export function DrawingContextMenu({ store, menu, onClose, revision }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const drawing = store.list().find((d) => d.id === menu.id);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  if (!drawing) return null;

  const patchStyle = (partial: Partial<typeof drawing.style>) => {
    store.patch(drawing.id, { style: { ...drawing.style, ...partial } }, { history: true });
    store.commit();
  };

  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 w-48 rounded-md border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 0) - 200), top: menu.y }}
    >
      <Item icon={Settings2} label="Settings" onClick={() => setShowSettings((v) => !v)} />
      {showSettings && (
        <div className="mb-1 space-y-2 rounded-md bg-muted/40 p-2">
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Colour ${c}`}
                onClick={() => patchStyle({ color: c })}
                className={cn("h-4 w-4 rounded-full border", drawing.style.color === c ? "ring-2 ring-primary" : "border-border/60")}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => patchStyle({ width: w })}
                className={cn(
                  "flex-1 rounded px-1 py-0.5 text-[10px]",
                  drawing.style.width === w ? "bg-primary/15 text-primary" : "hover:bg-muted",
                )}
              >
                {w}px
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {LINE_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => patchStyle({ lineStyle: s.id })}
                className={cn(
                  "flex-1 rounded px-1 py-0.5 text-[10px]",
                  drawing.style.lineStyle === s.id ? "bg-primary/15 text-primary" : "hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <Item icon={Copy} label="Duplicate" onClick={() => { store.duplicate(drawing.id); onClose(); }} />
      <Item
        icon={drawing.locked ? LockOpen : Lock}
        label={drawing.locked ? "Unlock" : "Lock"}
        onClick={() => {
          store.patch(drawing.id, { locked: !drawing.locked }, { history: true });
          store.commit();
          onClose();
        }}
      />
      <Item
        icon={drawing.hidden ? Eye : EyeOff}
        label={drawing.hidden ? "Show" : "Hide"}
        onClick={() => { store.setHidden(drawing.id, !drawing.hidden); onClose(); }}
      />
      <Item icon={Trash2} label="Delete" danger onClick={() => { store.remove(drawing.id); onClose(); }} />
      <span className="sr-only">{String(revision ?? "")}</span>
    </div>
  );
}

function Item({
  icon: Icon, label, onClick, danger,
}: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-muted",
        danger && "text-danger hover:bg-danger/10",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
