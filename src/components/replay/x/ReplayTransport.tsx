/**
 * Replay Studio X — Floating transport (Phase 1).
 *
 * Bottom-centre, detached from layout flow, FX-Replay style. Compact
 * transport + speed + jump + clock. Delegates to the existing replay
 * engine only — no playback logic lives here.
 */
import { useMemo, useState } from "react";
import {
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
  Flag,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SPEEDS } from "@/lib/replay/constants";
import { useReplay } from "../context";
import { RxDivider, RxFloat, RxIconButton, RxButton } from "./primitives";
import { cn } from "@/lib/utils";

export function ReplayTransport({ visible }: { visible: boolean }) {
  const {
    playing, toggle, restart, replayAgain, step, skip, speed, setSpeed,
    candles, cursorIdx, jumpTo, fastForwardUntil, addCheckpoint,
  } = useReplay();
  const [speedOpen, setSpeedOpen] = useState(false);

  const clock = useMemo(() => {
    const ts = candles[cursorIdx]?.time;
    if (!ts) return "--:--";
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }, [candles, cursorIdx]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-9 z-30 flex justify-center px-3 transition-opacity duration-[var(--rx-dur-slow)]",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <RxFloat className="pointer-events-auto flex items-center gap-0.5 px-1.5 py-1">
        <RxIconButton label="Skip -10 (Shift+←)" size="sm" onClick={() => skip(-10)}>
          <SkipBack className="h-3.5 w-3.5" />
        </RxIconButton>
        <RxIconButton label="Previous candle (←)" size="sm" onClick={() => step(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </RxIconButton>

        <RxButton
          tone="accent"
          size="lg"
          icon
          aria-label={playing ? "Pause" : "Play"}
          onClick={toggle}
          className="mx-1"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </RxButton>

        <RxIconButton label="Next candle (→)" size="sm" onClick={() => step(1)}>
          <ChevronRight className="h-4 w-4" />
        </RxIconButton>
        <RxIconButton label="Skip +10 (Shift+→)" size="sm" onClick={() => skip(10)}>
          <SkipForward className="h-3.5 w-3.5" />
        </RxIconButton>

        <RxDivider />

        {/* Speed */}
        <DropdownMenu open={speedOpen} onOpenChange={setSpeedOpen}>
          <DropdownMenuTrigger asChild>
            <RxButton size="sm" active={speedOpen} className="tabular-nums">
              {speed}x
            </RxButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[96px]">
            {SPEEDS.map((s) => (
              <DropdownMenuItem key={s} onClick={() => setSpeed(s)} className="text-xs tabular-nums">
                {s}x
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Jump to */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RxButton size="sm">
              <ArrowRightToLine className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Jump</span>
            </RxButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-60">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <Zap className="mr-1 inline h-3 w-3" /> Fast forward until
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => fastForwardUntil("next_order_trigger")}>Next order trigger (F)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Jump to session</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => jumpTo("asia_open")}>Asia Open</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("london_open")}>London Open</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("ny_open")}>New York Open</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("session_close")}>Session Close</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("next_day")}>Next day</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("prev_day")}>Previous day</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Trades &amp; marks</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => jumpTo("next_trade")}>Next trade (T)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("prev_trade")}>Previous trade (Shift+T)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("next_bookmark")}>Next bookmark (B)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => jumpTo("next_objective")}>Next objective</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <Flag className="mr-1 inline h-3 w-3" /> Save checkpoint
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => addCheckpoint("london_open", "London Open")}>London Open</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addCheckpoint("ny_open", "NY Open")}>New York Open</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addCheckpoint("trade_entry", "Trade Entry")}>Trade Entry</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addCheckpoint("custom", "Custom (M)")}>Custom (M)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={restart}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restart cursor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { replayAgain(); }}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Replay again
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <RxDivider />

        <span className="px-1.5 text-[11px] font-medium tabular-nums rx-dim">{clock}</span>
        <span className="pr-1 text-[10px] tabular-nums rx-dim">
          {cursorIdx + 1}/{candles.length}
        </span>

        <span aria-live="polite" className="sr-only">
          {playing ? `Playing at ${speed}x` : "Paused"}
        </span>
      </RxFloat>
    </div>
  );
}
