/**
 * Journal source picker — the visible "which journal?" control.
 */
import { Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOURNAL_SOURCE_OPTIONS, useJournalSource, type JournalSource } from "@/lib/journal/source-filter";

export function JournalSourcePicker({ className }: { className?: string }) {
  const { source, setSource } = useJournalSource();
  return (
    <div className={className}>
      <Select value={source} onValueChange={(v) => setSource(v as JournalSource)}>
        <SelectTrigger className="h-9 w-[230px] rounded-xl border-border/60 bg-card text-sm" aria-label="Journal source">
          <Layers className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="All journals" />
        </SelectTrigger>
        <SelectContent>
          {JOURNAL_SOURCE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
