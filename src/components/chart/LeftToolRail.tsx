import {
  MousePointer2, TrendingUp, Minus, MoveHorizontal, Square, Circle,
  Type, Ruler, GitBranch, PenTool, Eraser, Magnet, Lock, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DrawingTool } from "@/lib/chart/types";

interface Props {
  active: DrawingTool;
  onChange: (t: DrawingTool) => void;
}

const TOOLS: { key: DrawingTool; icon: any; title: string }[] = [
  { key: "cursor", icon: MousePointer2, title: "Cursor" },
  { key: "trend_line", icon: TrendingUp, title: "Trend line" },
  { key: "horizontal_line", icon: Minus, title: "Horizontal line" },
  { key: "ray", icon: MoveHorizontal, title: "Ray" },
  { key: "fib_retracement", icon: GitBranch, title: "Fib retracement" },
  { key: "rectangle", icon: Square, title: "Rectangle" },
  { key: "circle", icon: Circle, title: "Circle" },
  { key: "brush", icon: PenTool, title: "Brush" },
  { key: "text", icon: Type, title: "Text" },
  { key: "measure", icon: Ruler, title: "Measure" },
];

export function LeftToolRail({ active, onChange }: Props) {
  return (
    <aside className="flex h-full w-10 shrink-0 flex-col items-center gap-0.5 border-r border-border/60 bg-surface-2 py-1">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const on = active === t.key;
        return (
          <button
            key={t.key}
            title={t.title}
            onClick={() => onChange(t.key)}
            className={cn(
              "grid h-8 w-8 place-items-center rounded transition",
              on ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
      <div className="my-1 h-px w-6 bg-border/60" />
      <button title="Magnet" className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground"><Magnet className="h-4 w-4" /></button>
      <button title="Lock all drawings" className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground"><Lock className="h-4 w-4" /></button>
      <button title="Hide/erase" className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground"><Eraser className="h-4 w-4" /></button>
      <button title="Remove all" className="mt-auto grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-background/60 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
    </aside>
  );
}
