/**
 * Phase 8B / Phase A · transport bar.
 *
 * Every control delegates to the controller, which delegates to the clock.
 * No timers and no execution logic live here. Seeking is forward-only by
 * design: the clock replays every observation on the way to the target so
 * pending orders, stops and targets in the skipped region still resolve.
 */
import { useMemo, useState } from "react";
import {
  CalendarClock, ChevronRight, FastForward, Gauge, Pause, Play, SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_SPEED, MIN_SPEED } from "@/lib/replay/session/clock";
import { sessionJumpTargets } from "@/lib/replay/navigation";
import { useReplayStudio } from "./context";
import { StudioHotkeys } from "./StudioHotkeys";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 10, 25, 50, 100];

/** `YYYY-MM-DDTHH:mm` in UTC, the value shape `<input type="datetime-local">` wants. */
function toLocalInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

export function PlaybackControls() {
  const { view, toggle, step, stepCandle, skipCandles, setSpeed, seekForwardTo, market } = useReplayStudio();

  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [scrub, setScrub] = useState<number | null>(null);

  const t = view?.transport;
  const d = view?.dataset;

  // Keyboard bindings live in <StudioHotkeys /> so playback, trading and the
  // help overlay all share one layer.


  const span = useMemo(() => {
    if (!d) return 0;
    return Math.max(0, d.endTime - d.startTime);
  }, [d]);

  if (!view || !t || !d) return null;
  const playing = t.status === "playing";
  const progressPermille = Math.round((scrub ?? t.progress) * 1000);

  /** Map a slider position back onto the dataset timeline and seek forward. */
  const commitScrub = (permille: number) => {
    setScrub(null);
    if (!span) return;
    const target = d.startTime + (permille / 1000) * span;
    if (target > t.marketTime) seekForwardTo(target);
  };

  const commitJump = () => {
    const ms = Date.parse(`${jumpValue}Z`);
    setJumpOpen(false);
    if (!Number.isFinite(ms)) return;
    if (ms > t.marketTime) seekForwardTo(ms);
  };

  // One-click session opens, resolved through each centre's own timezone so
  // they follow BST/GMT and EDT/EST. Unreachable targets stay visible with
  // their reason rather than disappearing — "why is there no London button"
  // is a worse question than "London is beyond this session's data".
  const jumpTargets = sessionJumpTargets({
    fromMs: t.marketTime,
    endMs: d.endTime,
    market,
  });

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-t border-border/60 bg-card/60 px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            variant={playing ? "secondary" : "default"}
            onClick={toggle}
            disabled={!t.canPlay && !t.canPause}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Play / pause (Space)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={step} disabled={!t.canStep}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Step one observation</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={stepCandle} disabled={!t.canStep}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Step one bar (→)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => skipCandles(10)}
            disabled={!t.canStep}
          >
            <FastForward className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Skip 10 bars — every observation still runs (⇧→)</TooltipContent>
      </Tooltip>

      {/* Speed — collapsed into a popover so the transport stays one thin bar. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-8 shrink-0 gap-1.5 px-2 font-mono text-[11px]">
            <Gauge className="h-3.5 w-3.5" /> {t.speed}x
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-auto p-1.5">
          <div className="grid grid-cols-3 gap-1">
            {SPEEDS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={t.speed === s ? "secondary" : "ghost"}
                className="h-7 px-2 font-mono text-[11px]"
                onClick={() => setSpeed(s)}
              >
                {s}x
              </Button>
            ))}
          </div>
          <div className="px-1 pt-1 text-[10px] text-muted-foreground">
            {MIN_SPEED}x – {MAX_SPEED}x
          </div>
        </PopoverContent>
      </Popover>

      {/* Seek — drag forward to fast-forward through the session. */}
      <div className="ml-1 flex min-w-[200px] flex-1 items-center gap-3">
        <Slider
          value={[progressPermille]}
          min={0}
          max={1000}
          step={1}
          disabled={!span || t.lifecycle === "completed"}
          onValueChange={(v) => setScrub(v[0] / 1000)}
          onValueCommit={(v) => commitScrub(v[0])}
          aria-label="Seek forward through the session"
        />
        <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {Math.min(t.candleIndex + 1, t.barCount).toLocaleString()}/{t.barCount.toLocaleString()}
        </span>
      </div>

      {/* Jump to an exact date and time inside the loaded range. */}
      <Popover
        open={jumpOpen}
        onOpenChange={(o) => {
          setJumpOpen(o);
          if (o) setJumpValue(toLocalInput(t.marketTime));
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 shrink-0 gap-1.5 px-2 text-[11px]">
            <CalendarClock className="h-3.5 w-3.5" /> Jump to
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-64 space-y-2">
          <div className="text-[11px] font-medium">Session opens</div>
          <div className="grid grid-cols-2 gap-1">
            {jumpTargets.map((target) => (
              <Tooltip key={target.key}>
                <TooltipTrigger asChild>
                  {/* `span` wrapper: a disabled button emits no pointer events,
                      so the tooltip explaining WHY it is disabled would never
                      open — which is the one case the tooltip exists for. */}
                  <span className="inline-flex">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full justify-between px-2 text-[11px]"
                      disabled={!target.reachable}
                      onClick={() => {
                        if (!target.reachable || target.at == null) return;
                        setJumpOpen(false);
                        seekForwardTo(target.at);
                      }}
                    >
                      <span className="truncate">{target.label}</span>
                      {target.at != null && (
                        <span className="ml-1 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {new Date(target.at).toISOString().slice(11, 16)}
                        </span>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {target.reachable
                    ? `${new Date(target.at!).toISOString().replace("T", " ").slice(0, 16)} UTC`
                    : target.reason}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div className="border-t border-border/60 pt-2 text-[11px] font-medium">
            Jump forward to (UTC)
          </div>
          <Input
            type="datetime-local"
            value={jumpValue}
            min={toLocalInput(t.marketTime)}
            max={toLocalInput(d.endTime)}
            onChange={(e) => setJumpValue(e.target.value)}
            className="h-8 text-[12px]"
          />
          <p className="text-[10px] leading-snug text-muted-foreground">
            Replay is forward-only — every bar in between is still executed, so stops and
            targets resolve exactly as they would have.
          </p>
          <Button size="sm" className="w-full" onClick={commitJump}>Jump</Button>
        </PopoverContent>
      </Popover>

      <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
        {new Date(t.marketTime).toISOString().replace("T", " ").slice(0, 16)} UTC
      </span>

      <StudioHotkeys />
    </div>
  );
}
