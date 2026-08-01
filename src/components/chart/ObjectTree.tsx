/**
 * Object Tree — TradingView-style drawing manager.
 *
 * Lists every drawing on the current symbol grouped by tool family, with
 * select / lock / hide / duplicate / delete. Purely a view over
 * `DrawingStore`: it owns no geometry and no persistence of its own, so the
 * chart canvas stays the single source of truth for what is painted.
 */
import { useMemo } from "react";
import {
  Copy, Eye, EyeOff, Lock, LockOpen, Shapes, Trash2, X, type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DrawingStore } from "@/lib/chart/drawings/store";
import { KIND_LABELS, type Drawing, type DrawingKind } from "@/lib/chart/drawings/types";
import { TOOL_GROUPS, toolById } from "@/components/chart/DrawingToolRail";

/** kind → tool-group id, derived from the rail so the two never drift apart. */
const GROUP_OF: Partial<Record<DrawingKind, string>> = Object.fromEntries(
  TOOL_GROUPS.flatMap((g) => g.tools.map((t) => [t.id, g.id])),
) as Partial<Record<DrawingKind, string>>;

const GROUP_LABEL: Record<string, string> = Object.fromEntries(
  TOOL_GROUPS.map((g) => [g.id, g.label]),
);

function iconFor(kind: DrawingKind): LucideIcon {
  return toolById(kind)?.icon ?? Shapes;
}

function describe(d: Drawing, format: (p: number) => string): string {
  if (d.style.text) return d.style.text.split("\n")[0].slice(0, 28);
  const p = d.points[0];
  if (!p) return "—";
  if (d.kind === "vertical_line") return new Date(p.time).toLocaleString();
  return format(p.price);
}

export function ObjectTree({
  store,
  revision,
  formatPrice,
  onClose,
  className,
}: {
  store: DrawingStore;
  /** Store revision — re-renders the tree whenever drawings change. */
  revision?: unknown;
  formatPrice: (p: number) => string;
  onClose?: () => void;
  className?: string;
}) {
  const selectedId = store.selectedIdValue();

  const groups = useMemo(() => {
    const byGroup = new Map<string, Drawing[]>();
    for (const d of store.list()) {
      const gid = GROUP_OF[d.kind] ?? "other";
      const arr = byGroup.get(gid) ?? [];
      arr.push(d);
      byGroup.set(gid, arr);
    }
    return [...byGroup.entries()].map(([id, items]) => ({
      id,
      label: GROUP_LABEL[id] ?? "Other",
      items: [...items].sort((a, b) => b.createdAt - a.createdAt),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, revision]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div
      className={cn(
        "flex w-64 flex-col overflow-hidden rounded-md border border-border/60 bg-card/95 shadow-lg backdrop-blur",
        className,
      )}
      role="tree"
      aria-label="Chart objects"
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
        <Shapes className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Objects</span>
        <span className="rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">{total}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {total > 0 && (
            <IconAction label="Remove all objects" icon={Trash2} danger onClick={() => store.removeAll()} />
          )}
          {onClose && <IconAction label="Close object tree" icon={X} onClick={onClose} />}
        </div>
      </header>

      <div className="max-h-[60vh] min-h-[80px] flex-1 overflow-y-auto p-1">
        {total === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            No objects yet.
            <br />
            Draw on the chart and everything you add appears here.
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.id} className="mb-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              {g.items.map((d) => {
                const Icon = iconFor(d.kind);
                const active = d.id === selectedId;
                return (
                  <div
                    key={d.id}
                    role="treeitem"
                    aria-selected={active}
                    onMouseEnter={() => store.setHovered(d.id)}
                    onMouseLeave={() => store.setHovered(null)}
                    className={cn(
                      "group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition",
                      active ? "bg-primary/15 text-primary" : "hover:bg-muted/70",
                      d.hidden && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => store.select(d.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: d.style.color }} />
                      <span className="truncate">{KIND_LABELS[d.kind]}</span>
                      <span className="ml-auto shrink-0 pl-1 text-[10px] tabular-nums text-muted-foreground">
                        {describe(d, formatPrice)}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <IconAction
                        label={d.hidden ? "Show object" : "Hide object"}
                        icon={d.hidden ? EyeOff : Eye}
                        onClick={() => store.setHidden(d.id, !d.hidden)}
                      />
                      <IconAction
                        label={d.locked ? "Unlock object" : "Lock object"}
                        icon={d.locked ? Lock : LockOpen}
                        onClick={() => store.patch(d.id, { locked: !d.locked }, { history: true })}
                      />
                      <IconAction label="Duplicate object" icon={Copy} onClick={() => store.duplicate(d.id)} />
                      <IconAction label="Delete object" icon={Trash2} danger onClick={() => store.remove(d.id)} />
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function IconAction({
  label, icon: Icon, danger, onClick,
}: { label: string; icon: LucideIcon; danger?: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "h-6 w-6 text-muted-foreground hover:text-foreground",
            danger && "hover:text-destructive",
          )}
        >
          <Icon className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
