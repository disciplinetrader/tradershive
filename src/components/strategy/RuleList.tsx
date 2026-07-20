import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nextRuleId } from "@/lib/strategy/calculations";
import type { Rule } from "@/lib/strategy/types";

export function RuleList({
  rules, onChange, placeholder = "Add a rule…", label,
}: { rules: Rule[]; onChange: (r: Rule[]) => void; placeholder?: string; label?: string }) {
  const set = (idx: number, text: string) => {
    const next = rules.slice();
    next[idx] = { ...next[idx], text };
    onChange(next);
  };
  const add = () => onChange([...rules, { id: nextRuleId(), text: "" }]);
  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {label ? <div className="text-xs font-semibold text-muted-foreground">{label}</div> : null}
      {rules.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
          <Input value={r.text} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} className="h-9" />
          <Button variant="ghost" size="icon" aria-label="Remove rule" onClick={() => remove(i)} className="h-8 w-8"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add} className="h-8"><Plus className="mr-1.5 h-3.5 w-3.5" />Add rule</Button>
    </div>
  );
}
