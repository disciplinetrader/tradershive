import { useEffect, useState } from "react";
import {
  ArrowRightToLine,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Flag,
  Keyboard,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SPEEDS } from "@/lib/replay/constants";
import { inferSession, SESSION_LABEL } from "@/lib/statistics/session";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";

/** Keyboard shortcut sheet — opens with `?`, closes with Esc. */
const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / Pause"],
  ["← / →", "Step 1 candle"],
  ["Shift + ← / →", "Skip 10 candles"],
  ["+ / -", "Faster / slower playback"],
  ["B / Shift+B", "Next / previous bookmark"],
  ["T / Shift+T", "Next / previous trade"],
  ["M", "Bookmark current candle"],
  ["S", "Snapshot chart"],
  ["F", "Fast-forward to next trade"],
  ["?", "Show this help"],
  ["Esc", "Close dialogs · exit focus"],
];

function IconBtn({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" onClick={onClick} disabled={disabled} aria-label={label} className="h-8 w-8">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ReplayControls() {
  const {
    playing, toggle, restart, replayAgain, step, skip, speed, setSpeed,
    candles, cursorIdx, setCursorIdx, jumpTo, fastForwardUntil, addCheckpoint,
  } = useReplay();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.code === "ArrowRight") { e.shiftKey ? skip(10) : step(1); }
      else if (e.code === "ArrowLeft") { e.shiftKey ? skip(-10) : step(-1); }
      else if (e.key === "b") { jumpTo("next_bookmark"); }
      else if (e.key === "B") { jumpTo("prev_bookmark"); }
      else if (e.key === "t") { jumpTo("next_trade"); }
      else if (e.key === "T") { jumpTo("prev_trade"); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); fastForwardUntil("next_order_trigger"); }
      else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        addCheckpoint("custom", "Bookmark");
      }
      else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        // Reuse the workspace snapshot pipeline set up in replay.session.tsx.
        window.dispatchEvent(new Event("replay-capture"));
      }
      else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const idx = (SPEEDS as readonly number[]).indexOf(speed);
        if (idx >= 0 && idx < SPEEDS.length - 1) setSpeed(SPEEDS[idx + 1]);
      }
      else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const idx = (SPEEDS as readonly number[]).indexOf(speed);
        if (idx > 0) setSpeed(SPEEDS[idx - 1]);
      }
      else if (e.key === "?") { e.preventDefault(); setHelpOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step, skip, jumpTo, fastForwardUntil, addCheckpoint, speed, setSpeed]);

  const currentTs = candles[cursorIdx]?.time;
  const sessionKey = currentTs ? inferSession(new Date(currentTs).toISOString()) : "other";

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Replay controls"
        className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur p-2 space-y-2"
      >
        {/* Row 1: transport + jumps */}
        <div className="flex flex-wrap items-center gap-1">
          <IconBtn label="Restart cursor" onClick={restart}><RotateCcw className="h-4 w-4" /></IconBtn>
          <IconBtn label="Replay Again (reset progress)" onClick={replayAgain}><RefreshCw className="h-4 w-4" /></IconBtn>
          <div className="mx-1 h-6 w-px bg-border/60" />
          <IconBtn label="Prev bookmark (Shift+B)" onClick={() => jumpTo("prev_bookmark")}><Bookmark className="h-4 w-4 rotate-180" /></IconBtn>
          <IconBtn label="Prev trade (Shift+T)" onClick={() => jumpTo("prev_trade")}><TrendingUp className="h-4 w-4 rotate-180" /></IconBtn>
          <IconBtn label="Skip -10 (Shift+←)" onClick={() => skip(-10)}><SkipBack className="h-4 w-4" /></IconBtn>
          <IconBtn label="Prev candle (←)" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></IconBtn>

          <Button size="icon" variant="default" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="h-9 w-9 mx-1">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <IconBtn label="Next candle (→)" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></IconBtn>
          <IconBtn label="Skip +10 (Shift+→)" onClick={() => skip(10)}><SkipForward className="h-4 w-4" /></IconBtn>
          <IconBtn label="Next trade (T)" onClick={() => jumpTo("next_trade")}><TrendingUp className="h-4 w-4" /></IconBtn>
          <IconBtn label="Next bookmark (B)" onClick={() => jumpTo("next_bookmark")}><Bookmark className="h-4 w-4" /></IconBtn>

          <div className="mx-1 h-6 w-px bg-border/60" />

          {/* Unified Navigate menu — was 3 separate dropdowns (Fast forward,
              Jump to, Save checkpoint). Grouped sections keep parity while
              reducing chrome. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs">
                <ArrowRightToLine className="h-3.5 w-3.5" />Navigate
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <Zap className="mr-1 inline h-3 w-3" /> Fast forward until
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => fastForwardUntil("next_order_trigger")}>Next order trigger (F)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fastForwardUntil("next_pending_order")}>Next pending order fill</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fastForwardUntil("next_sl")}>Next stop-loss hit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fastForwardUntil("next_tp")}>Next take-profit hit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fastForwardUntil("next_bookmark")}>Next bookmark</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Jump to session</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => jumpTo("asia_open")}>Asia Open</DropdownMenuItem>
              <DropdownMenuItem onClick={() => jumpTo("london_open")}>London Open</DropdownMenuItem>
              <DropdownMenuItem onClick={() => jumpTo("ny_open")}>New York Open</DropdownMenuItem>
              <DropdownMenuItem onClick={() => jumpTo("session_close")}>Session Close</DropdownMenuItem>
              <DropdownMenuItem onClick={() => jumpTo("next_day")}>Next day</DropdownMenuItem>
              <DropdownMenuItem onClick={() => jumpTo("prev_day")}>Previous day</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Trades &amp; objectives</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => jumpTo("trade_entry")}>First trade entry</DropdownMenuItem>
              <DropdownMenuItem onClick={() => jumpTo("trade_exit")}>Last trade exit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => jumpTo("next_objective")}>Next objective</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <Flag className="mr-1 inline h-3 w-3" /> Save checkpoint
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => addCheckpoint("london_open", "London Open")}>London Open</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addCheckpoint("ny_open", "NY Open")}>New York Open</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addCheckpoint("trade_entry", "Trade Entry")}>Trade Entry</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addCheckpoint("liquidity_sweep", "Liquidity Sweep")}>Liquidity Sweep</DropdownMenuItem>
              <DropdownMenuItem onClick={() => addCheckpoint("custom", "Custom (M)")}>Custom (M)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="rounded-md border border-border/50 bg-background/50 px-2 py-1 text-[10px] font-medium text-muted-foreground">
              Session: <span className="text-foreground">{SESSION_LABEL[sessionKey]}</span>
            </div>
            <IconBtn label="Keyboard shortcuts (?)" onClick={() => setHelpOpen(true)}>
              <Keyboard className="h-4 w-4" />
            </IconBtn>
          </div>
          {/* Live region for playback state announcements */}
          <span aria-live="polite" className="sr-only">
            {playing ? `Playing at ${speed}x` : "Paused"}
          </span>
        </div>


        {/* Row 2: timeline + speed */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-semibold tabular-nums transition border cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  speed === s
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-background/60",
                )}
              >
                {s}x
              </button>
            ))}

          </div>

          <div className="ml-2 flex-1 min-w-[160px]">
            <Slider
              value={[cursorIdx]}
              max={Math.max(1, candles.length - 1)}
              step={1}
              onValueChange={(v) => setCursorIdx(v[0] ?? 0)}
              aria-label="Replay timeline"
            />
          </div>

          <div className="text-[10px] tabular-nums text-muted-foreground min-w-[80px] text-right">
            {cursorIdx + 1} / {candles.length}
          </div>
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Keyboard className="h-4 w-4 text-primary" /> Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm">
            {SHORTCUTS.map(([keys, label]) => (
              <li key={keys} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <kbd className="rounded border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                  {keys}
                </kbd>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground pt-1">
            Shortcuts ignore typing in inputs. Press <kbd className="mx-0.5 rounded border border-border/60 bg-background/60 px-1 py-0.5 text-[10px]">?</kbd> anytime to reopen.
          </p>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
