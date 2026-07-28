import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useReplay } from "./context";

export function ChecklistPanel() {
  const { checklist, toggleCheck, addCheck } = useReplay();
  const [label, setLabel] = useState("");
  const done = checklist.filter((c) => c.checked).length;
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Checklist</div>
        <div className="text-xs text-muted-foreground">{done} / {checklist.length}</div>
      </div>
      <div className="space-y-1">
        {checklist.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-3 py-3 text-center text-[11px] text-muted-foreground">
            No objectives yet. Add rules like <em>“wait for confirmation”</em> or <em>“risk 1%”</em> — you'll grade yourself at the end.
          </div>
        ) : (
          checklist.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-background/40">
              <Checkbox checked={c.checked} onCheckedChange={(v) => toggleCheck(c.id, Boolean(v))} />
              <span className={c.checked ? "line-through text-muted-foreground" : ""}>{c.label}</span>
            </label>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Add item…" value={label} onChange={(e) => setLabel(e.target.value)}
          onKeyDown={async (e) => { if (e.key === "Enter" && label.trim()) { await addCheck(label); setLabel(""); } }} />
        <Button size="sm" onClick={async () => { if (label.trim()) { await addCheck(label); setLabel(""); } }}>Add</Button>
      </div>
    </GlassCard>
  );
}
