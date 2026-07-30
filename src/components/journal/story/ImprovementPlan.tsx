/** Improvement plan — five concrete actions, each accept / edit / dismiss. */
import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlanAction } from "@/lib/journal/story";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<PlanAction["kind"], string> = {
  stop: "Stop",
  continue: "Continue",
  rule: "Reinforce",
  drill: "Drill",
  goal: "Goal",
};

export function ImprovementPlan({
  actions,
  onAddToNotes,
  onPractise,
}: {
  actions: PlanAction[];
  onAddToNotes: (text: string) => void;
  onPractise: () => void;
}) {
  const [state, setState] = useState<Record<string, "accepted" | "dismissed">>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});

  return (
    <ul className="space-y-1">
      {actions.map((a) => {
        const s = state[a.id];
        if (s === "dismissed") return null;
        const title = text[a.id] ?? a.title;
        return (
          <li
            key={a.id}
            className={cn(
              "rounded border px-2 py-1.5",
              s === "accepted" ? "border-success/40 bg-success/5" : "border-border/40",
            )}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-muted/40 px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[a.kind]}
              </span>
              <div className="min-w-0 flex-1">
                {editing === a.id ? (
                  <Input
                    autoFocus
                    value={title}
                    onChange={(e) => setText((t) => ({ ...t, [a.id]: e.target.value }))}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                    className="h-6 text-[12px]"
                  />
                ) : (
                  <p className="text-[12px] font-medium text-foreground">{title}</p>
                )}
                <p className="text-[10px] text-muted-foreground">{a.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1"
                  title="Accept and add to notes"
                  onClick={() => {
                    setState((v) => ({ ...v, [a.id]: "accepted" }));
                    onAddToNotes(`${KIND_LABEL[a.kind]}: ${title}`);
                    if (a.kind === "drill") onPractise();
                    toast.success("Added to your plan");
                  }}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 px-1" title="Edit" onClick={() => setEditing(a.id)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-muted-foreground"
                  title="Dismiss"
                  onClick={() => setState((v) => ({ ...v, [a.id]: "dismissed" }))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
