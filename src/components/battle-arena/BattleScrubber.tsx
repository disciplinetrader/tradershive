import { Eye, EyeOff, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useBattleReplay } from "./battle-replay-context";

/**
 * Replay transport for the live battle screen.
 *
 * Reads like FX Replay's control bar and behaves nothing like it, on purpose.
 * In a battle the market belongs to `battles.start_at`, not to the trader, so
 * the controls that would let a competitor move it do not exist here:
 *
 *   · no scrubber handle   — dragging forward would reveal future price action
 *   · no skip-forward      — same, one bar at a time
 *   · no speed control     — speed is fixed at creation and shared by everyone
 *   · no timeframe switch  — the dataset is one timeframe by construction
 *
 * These are ABSENT, not disabled. A disabled control is an invitation to find
 * the code path behind it; a control that was never wired has no code path.
 *
 * What remains is a progress readout and a personal freeze. Freezing stops this
 * viewer's chart, never the market — the engine keeps advancing behind it, so
 * stops and targets keep resolving and unfreezing snaps to wherever the battle
 * now is. That cost is the point: looking away is allowed, pausing is not.
 */
export function BattleScrubber() {
  const { status, progress, paused, setPaused, atEnd, error } = useBattleReplay();

  // Live-price battles keep the old header layout — nothing to show.
  if (status === "idle") return null;

  if (status === "error") {
    return (
      <div className="flex h-11 items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 text-[11px] font-bold text-danger">
        {error ?? "Replay unavailable"}
      </div>
    );
  }

  const pct = Math.round(progress * 100);

  return (
    <TooltipProvider>
      <div className="flex h-11 items-center gap-4 rounded-xl border border-border/40 bg-card/40 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2 shrink-0">
          <Radio
            className={cn(
              "h-3.5 w-3.5",
              atEnd ? "text-muted-foreground" : "text-success animate-pulse",
            )}
          />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {status === "loading" ? "Loading tape" : atEnd ? "Tape complete" : "Replay"}
          </span>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <Progress value={pct} className="h-1.5 w-full" />
          <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-primary">
            {pct}%
          </span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPaused(!paused)}
              disabled={status !== "ready"}
              className={cn(
                "h-8 shrink-0 gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest",
                paused ? "bg-warning/20 text-warning hover:bg-warning/30" : "text-muted-foreground",
              )}
            >
              {paused ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {paused ? "Frozen" : "Freeze"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px] text-center">
            {paused
              ? "Your chart is frozen. The market is still moving and your stops and targets are still live — unfreeze to catch up."
              : "Freeze your own chart. The battle's market keeps running; this only stops what you see."}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
