/**
 * Replay Studio X — Bottom Dock (Phase 1).
 *
 * Replaces the permanent right sidebar. Collapsed to a 32px tab bar by
 * default; expands to a resizable drawer. Active tab, open state and
 * height persist via the workspace prefs hook.
 */
import { useRef } from "react";
import { Bookmark, ChevronDown, ChevronUp, Flag, GraduationCap, ListChecks, NotebookPen, Trophy, Wallet } from "lucide-react";
import { TradePanel } from "../TradePanel";
import { NotesPanel } from "../NotesPanel";
import { BookmarksPanel } from "../BookmarksPanel";
import { CheckpointsPanel } from "../CheckpointsPanel";
import { ChecklistPanel } from "../ChecklistPanel";
import { AiReviewPanel } from "../AiReviewPanel";
import { ScoreCard } from "../ScoreCard";
import { useReplay } from "../context";
import { RxIconButton } from "./primitives";
import { RX } from "@/lib/replay/design-tokens";
import type { ReplayDockTab } from "@/hooks/use-replay-workspace-prefs";
import { cn } from "@/lib/utils";

const TABS: { id: ReplayDockTab; label: string; icon: typeof Wallet }[] = [
  { id: "trades", label: "Trades", icon: Wallet },
  { id: "journal", label: "Journal", icon: NotebookPen },
  { id: "coach", label: "Coach", icon: GraduationCap },
  { id: "marks", label: "Marks", icon: Flag },
  { id: "results", label: "Results", icon: Trophy },
];

export function ReplayBottomDock({
  open,
  tab,
  height,
  onOpenChange,
  onTabChange,
  onHeightChange,
}: {
  open: boolean;
  tab: ReplayDockTab;
  height: number;
  onOpenChange: (v: boolean) => void;
  onTabChange: (t: ReplayDockTab) => void;
  onHeightChange: (h: number) => void;
}) {
  const { session, openTrades, trades } = useReplay();
  const drag = useRef<{ y: number; h: number } | null>(null);

  const counts: Partial<Record<ReplayDockTab, number>> = {
    trades: openTrades.length || trades.length,
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: height };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onHeightChange(drag.current.h + (drag.current.y - e.clientY));
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="rx-dock relative shrink-0">
      {open ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize dock"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => onHeightChange(RX.dockDefaultH)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 12;
            if (e.key === "ArrowUp") { e.preventDefault(); onHeightChange(height + step); }
            if (e.key === "ArrowDown") { e.preventDefault(); onHeightChange(height - step); }
          }}
          className="absolute -top-[3px] left-0 right-0 z-10 h-[6px] cursor-row-resize focus-visible:outline-none focus-visible:bg-[var(--rx-accent-soft)]"
        />
      ) : null}

      {/* Tab bar — always visible, 32px */}
      <div className="flex items-center gap-0 px-1" style={{ height: RX.dockCollapsedH }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className="rx-dock-tab"
            data-active={open && tab === t.id ? "true" : undefined}
            onClick={() => {
              if (tab === t.id && open) onOpenChange(false);
              else { onTabChange(t.id); onOpenChange(true); }
            }}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {counts[t.id] ? (
              <span className="ml-0.5 rounded-[var(--rx-radius-xs)] bg-[var(--rx-surface-2)] px-1 text-[9px] tabular-nums">
                {counts[t.id]}
              </span>
            ) : null}
          </button>
        ))}
        <div className="ml-auto pr-1">
          <RxIconButton
            label={open ? "Collapse dock" : "Expand dock"}
            size="sm"
            side="top"
            onClick={() => onOpenChange(!open)}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </RxIconButton>
        </div>
      </div>

      {open ? (
        <div
          className="overflow-auto px-3 pb-3"
          style={{ height }}
          role="region"
          aria-label={`${tab} panel`}
        >
          {tab === "trades" && <TradePanel />}
          {tab === "journal" && <NotesPanel />}
          {tab === "coach" && (session ? <AiReviewPanel sessionId={session.id} /> : null)}
          {tab === "marks" && (
            <div className="grid gap-4 md:grid-cols-3">
              <DockSection icon={Bookmark} label="Bookmarks"><BookmarksPanel /></DockSection>
              <DockSection icon={Flag} label="Checkpoints"><CheckpointsPanel /></DockSection>
              <DockSection icon={ListChecks} label="Checklist"><ChecklistPanel /></DockSection>
            </div>
          )}
          {tab === "results" && <ScoreCard />}
        </div>
      ) : null}
    </div>
  );
}

function DockSection({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Flag;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-2")}>
      <div className="rx-caps flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}
