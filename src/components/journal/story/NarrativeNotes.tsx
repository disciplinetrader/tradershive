/**
 * Narrative notes — the explanation half of the story. Sections write into the
 * `narrative` jsonb column; the two legacy fields (entry_reason_text,
 * notes_text) keep mirroring so old data and old surfaces stay intact.
 */
import { useEffect, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import { updateEntry, type EntryUpdate, type JournalEntry } from "@/lib/journal/api";
import { NARRATIVE_SECTIONS, readNarrative, type Narrative, type NarrativeKey } from "@/lib/journal/story";
import { cn } from "@/lib/utils";

const PLACEHOLDERS: Record<NarrativeKey, string> = {
  thesis: "Why this trade? The level, the trigger, the invalidation.",
  saw: "What the chart actually showed before you clicked.",
  did: "The orders you placed and the decisions you made in-trade.",
  well: "One thing you'd repeat exactly.",
  wrong: "One thing that cost you money or peace of mind.",
  learned: "The lesson in a single sentence.",
  rule: "Next time I will…",
  free: "Anything else worth remembering.",
};

export function NarrativeNotes({
  entry,
  focusRef,
  onSaved,
}: {
  entry: JournalEntry;
  focusRef?: React.MutableRefObject<(() => void) | null>;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<Narrative>(() => readNarrative(entry));

  // Re-sync when navigating between trades without unmounting.
  useEffect(() => setDraft(readNarrative(entry)), [entry.id]);

  const autosave = useAutosave<Narrative>(async (patch) => {
    const next = { ...readNarrative(entry), ...patch };
    const update: EntryUpdate = { narrative: next as unknown as EntryUpdate["narrative"] };
    if ("thesis" in patch) update.entry_reason_text = patch.thesis ?? null;
    if ("free" in patch) update.notes_text = patch.free ?? null;
    await updateEntry(entry.id, update);
    onSaved?.();
  });

  const setField = (key: NarrativeKey, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    autosave.save({ [key]: value } as Narrative);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        {autosave.status === "saving" ? (
          <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
        ) : autosave.status === "saved" ? (
          <><Check className="h-3 w-3 text-success" /> Saved</>
        ) : autosave.status === "error" ? (
          <span className="flex items-center gap-1 text-danger"><TriangleAlert className="h-3 w-3" /> Not saved</span>
        ) : null}

      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {NARRATIVE_SECTIONS.map((s, i) => (
          <div key={s.key} className={cn("space-y-1", (s.key === "free" || s.key === "thesis") && "md:col-span-2")}>
            <label htmlFor={`nar-${s.key}`} className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </label>
            <Textarea
              id={`nar-${s.key}`}
              ref={i === 0 && focusRef ? (el: HTMLTextAreaElement | null) => { focusRef.current = () => el?.focus(); } : undefined}
              value={draft[s.key] ?? ""}
              onChange={(e) => setField(s.key, e.target.value)}
              onBlur={() => autosave.flush()}
              placeholder={PLACEHOLDERS[s.key]}
              rows={s.key === "free" || s.key === "thesis" ? 3 : 2}
              className="resize-y border-border/50 bg-muted/10 text-[12px] leading-relaxed"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
