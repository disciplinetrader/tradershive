/**
 * Notebook — notes that are not about one trade.
 *
 * Built on `quick_notes` rather than a new table: it already existed with
 * title/content/pinned/colour and already backs the dashboard widget. The
 * notebook adds folder, template, and two ways to attach a note to something —
 * a single entry, or a date range — all nullable, so the widget is unaffected.
 *
 * A note has AT MOST one attachment. A note about one trade and a note about a
 * fortnight are different kinds of thinking, and letting both be set at once
 * makes "what is this note about?" unanswerable.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Note = Database["public"]["Tables"]["quick_notes"]["Row"];
export type NoteInsert = Database["public"]["Tables"]["quick_notes"]["Insert"];

export const notebookKeys = {
  all: ["journal", "notebook"] as const,
  list: () => ["journal", "notebook", "list"] as const,
};

/** Starting points, not straitjackets — every field stays editable after use. */
export const NOTE_TEMPLATES: { id: string; label: string; body: string }[] = [
  {
    id: "trade_review",
    label: "Trade review",
    body: [
      "## What I saw",
      "",
      "## What I did",
      "",
      "## What I would do again",
      "",
      "## What I would not",
      "",
    ].join("\n"),
  },
  {
    id: "weekly_recap",
    label: "Weekly recap",
    body: [
      "## The number",
      "",
      "## What worked",
      "",
      "## What cost me",
      "",
      "## One rule for next week",
      "",
    ].join("\n"),
  },
  { id: "blank", label: "Blank", body: "" },
];

export type NoteAttachment =
  | { kind: "none" }
  | { kind: "entry"; entryId: string }
  | { kind: "range"; start: string; end: string };

export function attachmentOf(n: Note): NoteAttachment {
  if (n.entry_id) return { kind: "entry", entryId: n.entry_id };
  if (n.range_start && n.range_end) return { kind: "range", start: n.range_start, end: n.range_end };
  return { kind: "none" };
}

/** Mutually exclusive by construction — see the module note. */
export function attachmentPatch(a: NoteAttachment): Pick<NoteInsert, "entry_id" | "range_start" | "range_end"> {
  if (a.kind === "entry") return { entry_id: a.entryId, range_start: null, range_end: null };
  if (a.kind === "range") return { entry_id: null, range_start: a.start, range_end: a.end };
  return { entry_id: null, range_start: null, range_end: null };
}

export async function fetchNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from("quick_notes")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertNote(input: NoteInsert & { id?: string }): Promise<Note> {
  const { data, error } = await supabase
    .from("quick_notes")
    .upsert({ ...input, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("quick_notes").delete().eq("id", id);
  if (error) throw error;
}

/** Folder list, blank folder last under an explicit label. */
export function foldersOf(notes: Note[]): string[] {
  const set = new Set<string>();
  for (const n of notes) if (n.folder?.trim()) set.add(n.folder.trim());
  return [...set].sort();
}

export const UNFILED = "Unfiled";

export function folderOf(n: Note): string {
  return n.folder?.trim() || UNFILED;
}

/**
 * Client-side search over title and body.
 *
 * The GIN index added with the notebook supports a server-side `to_tsvector`
 * search; this stays client-side while the note count is small, so typing is
 * instant and there is no round trip per keystroke. Swap when a user's notes
 * outgrow one fetch.
 */
export function searchNotes(notes: Note[], q: string): Note[] {
  const term = q.trim().toLowerCase();
  if (!term) return notes;
  return notes.filter(
    (n) =>
      n.title.toLowerCase().includes(term) ||
      n.content.toLowerCase().includes(term) ||
      (n.folder ?? "").toLowerCase().includes(term),
  );
}
