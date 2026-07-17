import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Task = { id: string; label: string; done: boolean };

const DEFAULTS: Task[] = [
  { id: "j", label: "Journal a trade", done: false },
  { id: "c", label: "Complete today's challenge", done: false },
  { id: "p", label: "Practice 30 minutes", done: false },
  { id: "r", label: "Review yesterday's trades", done: false },
];

export function ProductivityWidget() {
  const [tasks, setTasks] = useState<Task[]>(DEFAULTS);
  const done = tasks.filter((t) => t.done).length;
  const pct = Math.round((done / tasks.length) * 100);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="uppercase tracking-wider text-muted-foreground">Today's goals</span>
        <span className="font-mono tabular-nums">{done}/{tasks.length}</span>
      </div>
      <div className="relative mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full gradient-primary"
        />
      </div>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              onClick={() =>
                setTasks((xs) => xs.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
              }
              className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-2.5 text-left text-sm transition hover:border-primary/30"
            >
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition",
                  t.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-transparent",
                )}
                aria-hidden
              >
                {t.done ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span className={cn("flex-1", t.done && "text-muted-foreground line-through")}>
                {t.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
