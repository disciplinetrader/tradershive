/**
 * Psychology section — before / during / after, with intensity and notes.
 * Chips write to the structured `psychology` jsonb while still mirroring the
 * canonical five emotions onto the legacy `emotions` column.
 */
import { useMemo } from "react";
import {
  PSYCH_CHIPS,
  PSYCH_STAGE_LABEL,
  readPsychology,
  type PsychStage,
  type PsychologyState,
} from "@/lib/journal/editor/model";
import { DEFAULT_EMOTIONS } from "@/lib/journal/constants";
import { cn } from "@/lib/utils";
import { useTradeEditorContext } from "../TradeEditorProvider";
import { Chip, ChipGroup, RatingField, SubHeading, TextAreaField } from "../fields";

const LEGACY_MAP: Record<string, string> = {
  calm: "calm",
  calm_after: "calm",
  confident: "disciplined",
  disciplined: "disciplined",
  in_control: "disciplined",
  patient: "disciplined",
  focused: "disciplined",
  fear: "fear",
  anxiety: "fear",
  hesitation: "fear",
  stressed: "fear",
  fomo: "fomo",
  impulsive: "fomo",
  greed: "fomo",
  revenge: "revenge",
  frustrated: "revenge",
};

export function PsychologySection() {
  const { entry, setField, setTagValues } = useTradeEditorContext();
  const psych = useMemo(() => readPsychology(entry), [entry]);

  const write = (next: PsychologyState) => {
    const all = [...(next.before ?? []), ...(next.during ?? []), ...(next.after ?? [])];
    const legacy = Array.from(
      new Set(all.map((v) => LEGACY_MAP[v]).filter((v): v is string => Boolean(v))),
    );
    // emotions[] is projected from journal_entry_tags by trigger — the staged
    // psychology blob is this editor's own column.
    setField({ psychology: next as never });
    void setTagValues("emotion", legacy);
  };

  const toggle = (stage: PsychStage, value: string) => {
    const cur = psych[stage] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    write({ ...psych, [stage]: next });
  };

  const setIntensity = (value: string, level: number) => {
    write({ ...psych, intensity: { ...(psych.intensity ?? {}), [value]: level } });
  };

  const setNote = (stage: PsychStage, text: string) => {
    write({ ...psych, notes: { ...(psych.notes ?? {}), [stage]: text } });
  };

  const stages: PsychStage[] = ["before", "during", "after"];

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const selected = psych[stage] ?? [];
        return (
          <div key={stage} className="space-y-2 rounded border border-border/50 bg-muted/5 p-2.5">
            <SubHeading>{PSYCH_STAGE_LABEL[stage]}</SubHeading>
            <ChipGroup
              options={PSYCH_CHIPS[stage]}
              selected={selected}
              onToggle={(v) => toggle(stage, v)}
            />
            {selected.length ? (
              <div className="space-y-1.5 border-t border-border/40 pt-2">
                {selected.map((v) => {
                  const label = PSYCH_CHIPS[stage].find((c) => c.value === v)?.label ?? v;
                  const level = psych.intensity?.[v] ?? 0;
                  return (
                    <div key={v} className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-label={`${label} intensity ${n}`}
                            onClick={() => setIntensity(v, level === n ? 0 : n)}
                            className={cn(
                              "h-4 w-6 rounded-sm border text-[9px] transition",
                              level >= n
                                ? "border-primary/60 bg-primary/20 text-primary"
                                : "border-border/60 text-muted-foreground/60 hover:border-primary/40",
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <TextAreaField
              label="Notes"
              value={psych.notes?.[stage] ?? ""}
              rows={2}
              placeholder={
                stage === "before"
                  ? "State of mind walking into this."
                  : stage === "during"
                    ? "What you felt while it was live."
                    : "How you felt once it closed."
              }
              onCommit={(v) => setNote(stage, v)}
            />
          </div>
        );
      })}

      <div className="grid gap-2 sm:grid-cols-2">
        <RatingField
          label="Emotional control"
          value={entry.discipline}
          onCommit={(v) => setField({ discipline: v })}
          hint="Same value as the Review section — kept in sync."
        />
        <RatingField label="Patience" value={entry.patience} onCommit={(v) => setField({ patience: v })} />
      </div>

      <div className="space-y-1.5">
        <SubHeading>Legacy emotion tags</SubHeading>
        <div className="flex flex-wrap gap-1">
          {DEFAULT_EMOTIONS.map((e) => (
            <Chip key={e.value} active={(entry.emotions ?? []).includes(e.value)} onClick={() => {
              const cur = entry.emotions ?? [];
              void setTagValues("emotion", cur.includes(e.value) ? cur.filter((x) => x !== e.value) : [...cur, e.value]);
            }}>
              {e.label}
            </Chip>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/70">
          Derived automatically from the chips above; adjust only if the mapping is wrong.
        </p>
      </div>
    </div>
  );
}
