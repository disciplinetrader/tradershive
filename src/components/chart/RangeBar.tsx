import { useEffect, useState } from "react";
import { Calendar, Settings2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES = ["1D","5D","1M","3M","6M","YTD","1Y","5Y","All"] as const;
type Range = (typeof RANGES)[number];

interface Props { onSelect?: (r: Range) => void; }

export function RangeBar({ onSelect }: Props) {
  const [active, setActive] = useState<Range>("1M");
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const s = `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")} UTC`;
      setNow(s);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-8 items-center gap-1 border-t border-border/60 bg-surface-2 px-2 text-[11px]">
      <div className="flex items-center gap-0.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => { setActive(r); onSelect?.(r); }}
            className={cn(
              "rounded px-2 py-0.5 font-medium tabular-nums transition",
              active === r ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <button className="ml-1 grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground" aria-label="Date range" title="Date range">
        <Calendar className="h-3.5 w-3.5" />
      </button>

      <div className="ml-auto flex items-center gap-3 text-muted-foreground">
        <span className="tabular-nums">{now}</span>
        <div className="flex items-center gap-0.5">
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-background/60 hover:text-foreground" aria-label="Auto scale" title="Auto scale"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-background/60 hover:text-foreground" aria-label="Settings" title="Settings"><Settings2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}
