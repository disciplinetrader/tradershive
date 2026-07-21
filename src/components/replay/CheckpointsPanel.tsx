import { Flag, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { CHECKPOINT_LABEL } from "@/lib/replay/constants";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";

/** Panel listing all checkpoints for the current session with jump / delete controls. */
export function CheckpointsPanel() {
  const { checkpoints, jumpToCheckpoint, removeCheckpoint } = useReplay();

  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Flag className="h-3.5 w-3.5" /> Checkpoints ({checkpoints.length})
        </div>
      </div>
      {checkpoints.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          Use <span className="text-foreground font-medium">Save checkpoint</span> in the toolbar to mark this moment.
        </div>
      ) : (
        <ul className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
          {checkpoints.slice(0, 200).map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-xs group",
              )}
            >
              <button
                type="button"
                onClick={() => jumpToCheckpoint(c.id)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left"
                title="Jump to checkpoint"
              >
                <MapPin className="h-3 w-3 shrink-0 text-primary" />
                <span className="truncate">
                  <span className="font-medium">{c.label}</span>
                  <span className="ml-1 text-muted-foreground">· {CHECKPOINT_LABEL[c.kind]}</span>
                </span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => removeCheckpoint(c.id)}
                aria-label="Delete checkpoint"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
