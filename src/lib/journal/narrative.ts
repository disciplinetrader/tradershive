/**
 * Narrative registry — leaf module.
 *
 * Deliberately dependency-free (type-only imports). `story.ts` and
 * `editor/model.ts` both need this registry, and having it live in `story.ts`
 * created an import cycle
 * (story -> derive -> editor/model -> story) that surfaced at runtime as
 * "Cannot access 'NARRATIVE_SECTIONS' before initialization".
 */

import type { JournalEntry } from "@/lib/journal/api";

export const NARRATIVE_SECTIONS = [
  { key: "thesis", label: "Trade Thesis", hint: "Why this trade existed before you clicked.", legacy: "entry_reason_text" },
  { key: "saw", label: "What I Saw", hint: "The read on price at the moment of entry." },
  { key: "did", label: "What I Did", hint: "The actual sequence of decisions." },
  { key: "well", label: "What Went Well", hint: "Behaviour worth repeating." },
  { key: "wrong", label: "What Went Wrong", hint: "Behaviour that cost you." },
  { key: "learned", label: "What I Learned", hint: "The takeaway in one line." },
  { key: "rule", label: "Next-Time Rule", hint: "A rule you can actually check next session." },
  { key: "free", label: "Free-Form Notes", hint: "Anything else.", legacy: "notes_text" },
] as const;

export type NarrativeKey = (typeof NARRATIVE_SECTIONS)[number]["key"];
export type Narrative = Partial<Record<NarrativeKey, string>>;

/** Reads the stored narrative, falling back to the legacy text columns. */
export function readNarrative(entry: JournalEntry): Narrative {
  const raw = (entry as unknown as { narrative?: unknown }).narrative;
  const stored = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Narrative = {};
  for (const s of NARRATIVE_SECTIONS) {
    const v = stored[s.key];
    if (typeof v === "string" && v.trim()) out[s.key] = v;
  }
  if (!out.thesis && entry.entry_reason_text?.trim()) out.thesis = entry.entry_reason_text;
  if (!out.free && entry.notes_text?.trim()) out.free = entry.notes_text;
  return out;
}
