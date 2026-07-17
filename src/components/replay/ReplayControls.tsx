import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SPEEDS } from "@/lib/replay/constants";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";

export function ReplayControls() {
  const { playing, toggle, restart, step, skip, speed, setSpeed, candles, cursorIdx, setCursorIdx } = useReplay();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.code === "ArrowRight") { e.shiftKey ? skip(10) : step(1); }
      else if (e.code === "ArrowLeft") { e.shiftKey ? skip(-10) : step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step, skip]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-background/60 p-2">
      <Button size="icon" variant="ghost" onClick={restart} aria-label="Restart"><RotateCcw className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={() => skip(-10)} aria-label="Skip back"><SkipBack className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label="Previous candle"><ChevronLeft className="h-4 w-4" /></Button>
      <Button size="icon" variant="default" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button size="icon" variant="ghost" onClick={() => step(1)} aria-label="Next candle"><ChevronRight className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={() => skip(10)} aria-label="Skip forward"><SkipForward className="h-4 w-4" /></Button>

      <div className="ml-1 flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium transition",
              speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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

      <div className="text-[10px] tabular-nums text-muted-foreground">
        {cursorIdx + 1} / {candles.length}
      </div>
    </div>
  );
}
