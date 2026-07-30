/**
 * Narrative section — the written story, autosaved per field.
 * Uses the shared NARRATIVE_SECTIONS registry so the editor and the Trade
 * Story page always describe the same eight prompts.
 */
import { useMemo } from "react";
import { NARRATIVE_SECTIONS, readNarrative } from "@/lib/journal/story";
import { wordCount } from "@/lib/journal/format";
import { useTradeEditorContext } from "../TradeEditorProvider";
import { TextAreaField } from "../fields";

export function NarrativeSection() {
  const { entry, setNarrative } = useTradeEditorContext();
  const narrative = useMemo(() => readNarrative(entry), [entry]);
  const words = useMemo(
    () => NARRATIVE_SECTIONS.reduce((n, s) => n + wordCount(narrative[s.key] ?? ""), 0),
    [narrative],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Your account of the trade</span>
        <span className="tabular-nums">{words} words</span>
      </div>

      {NARRATIVE_SECTIONS.map((s) => (
        <div key={s.key} className="space-y-0.5">
          <TextAreaField
            label={s.label}
            value={narrative[s.key] ?? ""}
            rows={s.key === "free" ? 4 : 2}
            placeholder={s.hint}
            onCommit={(v) => setNarrative({ [s.key]: v })}
          />
        </div>
      ))}
    </div>
  );
}
