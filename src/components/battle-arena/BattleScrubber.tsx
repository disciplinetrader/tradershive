import { useEffect, useState } from "react";
import { Play, Pause, FastForward, SkipForward, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePaper } from "@/components/paper-trading/context";
import { Timeframe } from "@/lib/market-data/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

export function BattleScrubber() {
  const { timeframe, setTimeframe } = usePaper();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState([85]); // Mock progress for UI

  return (
    <div className="flex items-center gap-4 bg-card/40 border border-border/40 rounded-xl px-4 py-1.5 h-11 backdrop-blur-md">
      <div className="flex items-center gap-1.5 border-r border-border/40 pr-4 mr-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Progress</span>
        <Slider
          value={progress}
          onValueChange={setProgress}
          max={100}
          step={0.1}
          className="w-full"
        />
        <span className="text-[10px] font-mono font-bold text-primary shrink-0">85%</span>
      </div>

      <div className="flex items-center gap-2 border-l border-border/40 pl-4 ml-2">
        <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
          <SelectTrigger className="h-8 w-[70px] bg-background/40 border-border/40 text-[11px] font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEFRAMES.map((tf) => (
              <SelectItem key={tf} value={tf} className="text-xs font-bold">
                {tf}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button
          size="sm"
          variant="secondary"
          className="h-8 px-3 text-[11px] font-black uppercase tracking-tighter bg-primary/20 text-primary hover:bg-primary/30"
        >
          Live
        </Button>
      </div>
    </div>
  );
}
