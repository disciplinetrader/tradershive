/**
 * Studio hotkeys — a single keyboard layer for the whole replay surface.
 *
 * Every binding delegates to the studio context (which delegates to the
 * controller); nothing here mutates state directly. Typing in a field, or
 * holding a browser modifier, always wins over a shortcut.
 */
import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_SPEED, MIN_SPEED } from "@/lib/replay/session/clock";

import { useReplayStudio } from "./context";

const SPEED_LADDER = [0.25, 0.5, 1, 2, 4, 10, 25, 50, 100];

/**
 * `B` / `S` say "at risk %" and now mean it. They routed through
 * `placeMarketOrder` with no size before the order paths were consolidated,
 * which took the old `?? 1` fallback — so the label had been advertising a
 * sizing rule the hotkey did not follow. The default moved into
 * `placeMarketOrder` itself; every market route sizes off Risk % now.
 */
export const STUDIO_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Space", label: "Play / pause" },
  { keys: "→", label: "Step forward one bar" },
  { keys: "Shift + →", label: "Skip forward 10 bars" },
  { keys: "+ / −", label: "Faster / slower playback" },
  { keys: "B", label: "Market buy at risk %" },
  { keys: "S", label: "Market sell at risk %" },
  { keys: "E", label: "Move stop to break-even (newest position)" },
  { keys: "C", label: "Close newest position" },
  { keys: "Esc", label: "Cancel a right-click limit/stop draft, or a drawing" },
  { keys: "?", label: "Show this shortcut list" },
];

/** True when the event should be ignored (typing, or an OS/browser combo). */
function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  if (!el) return false;
  return /input|textarea|select/i.test(el.tagName) || el.isContentEditable;
}

export function StudioHotkeys() {
  const {
    view, toggle, stepCandle, skipCandles, setSpeed,
    placeMarketOrder, positions, breakEven, closePositionNow,
  } = useReplayStudio();
  const [helpOpen, setHelpOpen] = useState(false);

  const speed = view?.transport.speed ?? 1;
  const live = view?.transport.lifecycle !== "completed";
  const newest = positions.length ? positions[positions.length - 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          toggle();
          return;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) skipCandles(10);
          else stepCandle();
          return;
        case "+":
        case "=": {
          e.preventDefault();
          const next = SPEED_LADDER.find((s) => s > speed) ?? MAX_SPEED;
          setSpeed(next);
          return;
        }
        case "-":
        case "_": {
          e.preventDefault();
          const slower = [...SPEED_LADDER].reverse().find((s) => s < speed) ?? MIN_SPEED;
          setSpeed(slower);
          return;
        }
        case "?":
          e.preventDefault();
          setHelpOpen(true);
          return;
        default:
          break;
      }

      if (!live) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); placeMarketOrder("buy"); }
      else if (k === "s") { e.preventDefault(); placeMarketOrder("sell"); }
      else if (k === "e" && newest) { e.preventDefault(); breakEven(newest.id); }
      else if (k === "c" && newest) { e.preventDefault(); closePositionNow(newest.id); }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, stepCandle, skipCandles, setSpeed, speed, live, newest, placeMarketOrder, breakEven, closePositionNow]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Keyboard shortcuts"
            className="h-8 w-8 shrink-0"
            onClick={() => setHelpOpen(true)}
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
      </Tooltip>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Studio shortcuts</DialogTitle>
            <DialogDescription>
              Drive playback and trade without leaving the chart.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border/60 text-sm">
            {STUDIO_SHORTCUTS.map((s) => (
              <li key={s.keys} className="flex items-center justify-between gap-4 py-2">
                <span className="text-muted-foreground">{s.label}</span>
                <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {s.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
