import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type JournalEntry = Database["public"]["Tables"]["journal_entries"]["Row"];
export type JournalAttachment = Database["public"]["Tables"]["journal_attachments"]["Row"];
export type JournalHistory = Database["public"]["Tables"]["journal_history"]["Row"];

export type JournalTag = Database["public"]["Tables"]["journal_tags"]["Row"];

/**
 * Retired table, kept as a standalone shape: the taxonomy functions below are
 * an adapter over `journal_tags` and no longer touch `journal_taxonomy`.
 */
export type JournalTaxonomy = {
  id: string;
  user_id: string;
  kind: "setup" | "emotion" | "mistake";
  value: string;
  label: string;
  color: string | null;
  created_at: string;
};

export type EntryUpdate = Database["public"]["Tables"]["journal_entries"]["Update"];
export type EntryInsert = Database["public"]["Tables"]["journal_entries"]["Insert"];

export type ChecklistItem = { id: string; label: string; checked: boolean };

export const journalKeys = {
  all: ["journal"] as const,
  list: () => [...journalKeys.all, "list"] as const,
  entry: (id: string) => [...journalKeys.all, "entry", id] as const,
  attachments: (entryId: string) => [...journalKeys.all, "attachments", entryId] as const,
  history: (entryId: string) => [...journalKeys.all, "history", entryId] as const,
  tags: () => [...journalKeys.all, "tags"] as const,
  entryTags: (entryId: string) => [...journalKeys.all, "entryTags", entryId] as const,
  taxonomy: () => [...journalKeys.all, "taxonomy"] as const,
};

/* Entries */

export async function fetchEntries(): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .order("closed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as JournalEntry[];
}

export async function fetchEntry(id: string): Promise<JournalEntry | null> {
  const { data, error } = await supabase.from("journal_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as JournalEntry | null;
}

export async function createEntry(patch: EntryInsert): Promise<JournalEntry> {
  const { data, error } = await supabase.from("journal_entries").insert(patch).select().single();
  if (error) throw error;
  return data as JournalEntry;
}

export async function updateEntry(id: string, patch: EntryUpdate): Promise<JournalEntry> {
  const { data, error } = await supabase
    .from("journal_entries")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as JournalEntry;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from("journal_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateEntry(userId: string, source: JournalEntry): Promise<JournalEntry> {
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    share_token: _s,
    is_public: _p,
    trade_id: _t,
    ...rest
  } = source;
  const inserted = await createEntry({
    ...rest,
    user_id: userId,
    status: "draft",
    is_public: false,
    share_token: null,
    trade_id: null,
    is_favorite: false,
  } as EntryInsert);
  return inserted;
}

/* Tags
 *
 * `journal_tags` + `journal_entry_tags` are the single tag system. A tag's
 * identity is (user_id, kind, value): `value` is the stable slug that
 * `journal_entries.emotions[] / mistakes[] / strategy_tags[]` store, and those
 * arrays are trigger-maintained projections of the join table. Never write an
 * array directly — write the join and let the trigger repaint it.
 */

export type JournalTagKind = "setup" | "mistake" | "emotion" | "custom";

export const TAG_KIND_ORDER: JournalTagKind[] = ["setup", "mistake", "emotion", "custom"];

export const TAG_KIND_LABEL: Record<JournalTagKind, string> = {
  setup: "Setup",
  mistake: "Mistake",
  emotion: "Emotion",
  custom: "Custom",
};

/**
 * Split a flat tag list into labelled sections, one per kind.
 *
 * Tag identity is (user_id, kind, value), so the same *label* can legitimately
 * exist under two kinds — "Breakout" as a setup and as a custom tag are
 * different tags. Rendering the dictionary flat shows two identical chips with
 * no way to tell them apart, which is a worse problem than the global-name
 * uniqueness constraint this replaced. Every surface that lists tags for
 * selection groups them.
 *
 * Empty kinds are dropped so a user with no custom tags sees no empty heading.
 */
export function groupTagsByKind(
  tags: JournalTag[],
): { kind: JournalTagKind; label: string; tags: JournalTag[] }[] {
  return TAG_KIND_ORDER.map((kind) => ({
    kind,
    label: TAG_KIND_LABEL[kind],
    tags: tags.filter((t) => t.kind === kind),
  })).filter((g) => g.tags.length > 0);
}

/** The slug form the arrays and the tag dictionary agree on. */
export function tagSlug(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Signature kept arg-free: several call sites pass it straight to `queryFn`. */
export async function fetchTags(): Promise<JournalTag[]> {
  const { data, error } = await supabase.from("journal_tags").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as JournalTag[];
}

export async function fetchTagsByKind(kind: JournalTagKind): Promise<JournalTag[]> {
  const { data, error } = await supabase
    .from("journal_tags")
    .select("*")
    .eq("kind", kind)
    .order("name");
  if (error) throw error;
  return (data ?? []) as JournalTag[];
}

export async function upsertTag(input: {
  userId: string;
  name: string;
  kind?: JournalTagKind;
  /** Defaults to the slug of `name`; pass explicitly to match an existing slug. */
  value?: string;
  color?: string;
}): Promise<JournalTag> {
  const name = input.name.trim();
  const { data, error } = await supabase
    .from("journal_tags")
    .upsert(
      {
        user_id: input.userId,
        kind: input.kind ?? "custom",
        value: input.value ?? tagSlug(name),
        name,
        color: input.color ?? "#3b82f6",
      },
      { onConflict: "user_id,kind,value" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as JournalTag;
}

/**
 * Replace the entry's tags *of one kind*, addressed by slug rather than id.
 *
 * This is what the editor surfaces call instead of writing `emotions[]` /
 * `mistakes[]` / `strategy_tags[]`. Tags are created on demand, so a value the
 * dictionary has not seen still lands. Tags of other kinds are left alone, so
 * editing emotions never disturbs mistakes.
 */
export async function setEntryTagValues(input: {
  entryId: string;
  userId: string;
  kind: Exclude<JournalTagKind, "custom">;
  values: string[];
}): Promise<void> {
  const { entryId, userId, kind } = input;
  const values = [...new Set(input.values.map((v) => v.trim()).filter(Boolean))];

  const existing = await fetchTagsByKind(kind);
  const byValue = new Map(existing.map((t) => [t.value, t]));

  const tagIds: string[] = [];
  for (const value of values) {
    const hit = byValue.get(value);
    if (hit) {
      tagIds.push(hit.id);
      continue;
    }
    const created = await upsertTag({
      userId,
      kind,
      value,
      name: value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
    tagIds.push(created.id);
  }

  // Only this kind's links are cleared — the delete is scoped by tag id.
  const kindIds = new Set(existing.map((t) => t.id));
  const { data: current, error: curErr } = await supabase
    .from("journal_entry_tags")
    .select("tag_id")
    .eq("entry_id", entryId);
  if (curErr) throw curErr;

  const stale = (current ?? [])
    .map((r) => r.tag_id)
    .filter((id) => kindIds.has(id) && !tagIds.includes(id));
  if (stale.length) {
    const { error } = await supabase
      .from("journal_entry_tags")
      .delete()
      .eq("entry_id", entryId)
      .in("tag_id", stale);
    if (error) throw error;
  }

  if (tagIds.length) {
    const { error } = await supabase
      .from("journal_entry_tags")
      .upsert(
        tagIds.map((tag_id) => ({ entry_id: entryId, tag_id, user_id: userId })),
        { onConflict: "entry_id,tag_id", ignoreDuplicates: true },
      );
    if (error) throw error;
  }
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from("journal_tags").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAllEntryTagLinks(): Promise<{ entry_id: string; tag_id: string }[]> {
  const { data, error } = await supabase.from("journal_entry_tags").select("entry_id, tag_id");
  if (error) throw error;
  return data ?? [];
}

export async function setEntryTags(entryId: string, userId: string, tagIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from("journal_entry_tags").delete().eq("entry_id", entryId);
  if (delErr) throw delErr;
  if (tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ entry_id: entryId, tag_id, user_id: userId }));
  const { error } = await supabase.from("journal_entry_tags").insert(rows);
  if (error) throw error;
}

/* Attachments */

export async function fetchAttachments(entryId: string): Promise<JournalAttachment[]> {
  const { data, error } = await supabase
    .from("journal_attachments")
    .select("*")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function recordAttachment(input: Omit<
  Database["public"]["Tables"]["journal_attachments"]["Insert"],
  "created_at" | "id"
>): Promise<JournalAttachment> {
  const { data, error } = await supabase.from("journal_attachments").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAttachmentRecord(id: string): Promise<void> {
  const { error } = await supabase.from("journal_attachments").delete().eq("id", id);
  if (error) throw error;
}

/* History */

export async function fetchHistory(entryId: string): Promise<JournalHistory[]> {
  const { data, error } = await supabase
    .from("journal_history")
    .select("*")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function recordHistory(input: {
  entryId: string;
  userId: string;
  action: string;
  snapshot?: unknown;
}): Promise<void> {
  await supabase.from("journal_history").insert({
    entry_id: input.entryId,
    user_id: input.userId,
    action: input.action,
    snapshot: (input.snapshot ?? null) as Database["public"]["Tables"]["journal_history"]["Insert"]["snapshot"],
  });
}

/* Taxonomy (custom setups / emotions / mistakes)
 *
 * `journal_taxonomy` is retired. These three functions are now a thin adapter
 * over `journal_tags`, which carries the same (kind, value, label, color) shape
 * since the consolidation — so the drawer, filters and entry dialog keep their
 * existing call sites while there is only one dictionary underneath.
 *
 * `label` is `journal_tags.name`. Nothing else differs.
 */

/** Shape the taxonomy consumers expect, projected from a tag row. */
function tagAsTaxonomy(t: JournalTag): JournalTaxonomy {
  return {
    id: t.id,
    user_id: t.user_id,
    kind: t.kind as JournalTaxonomy["kind"],
    value: t.value,
    label: t.name,
    color: t.color,
    created_at: t.created_at,
  };
}

export async function fetchTaxonomy(): Promise<JournalTaxonomy[]> {
  const { data, error } = await supabase
    .from("journal_tags")
    .select("*")
    .neq("kind", "custom")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as JournalTag[]).map(tagAsTaxonomy);
}

export async function upsertTaxonomy(input: {
  userId: string;
  kind: "setup" | "emotion" | "mistake";
  label: string;
  color?: string;
}): Promise<JournalTaxonomy> {
  const tag = await upsertTag({
    userId: input.userId,
    kind: input.kind,
    value: tagSlug(input.label),
    name: input.label.trim(),
    color: input.color ?? "#3b82f6",
  });
  return tagAsTaxonomy(tag);
}

export async function deleteTaxonomy(id: string): Promise<void> {
  const { error } = await supabase.from("journal_tags").delete().eq("id", id);
  if (error) throw error;
}

/* Share links */

function randomToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function enableShare(entryId: string): Promise<{ token: string }> {
  const token = randomToken();
  const { error } = await supabase
    .from("journal_entries")
    .update({ is_public: true, share_token: token })
    .eq("id", entryId);
  if (error) throw error;
  return { token };
}

export async function disableShare(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("journal_entries")
    .update({ is_public: false, share_token: null })
    .eq("id", entryId);
  if (error) throw error;
}

/** Columns rendered by the public share page. Kept explicit so private
 *  reflection/internal fields never leave the server via a share link. */
const SHARED_ENTRY_COLUMNS =
  "id, symbol, direction, session, setup, grade, rr, pnl, duration_seconds, emotions, mistakes, screenshots, notes_html, created_at, closed_at";

export async function fetchSharedEntry(token: string): Promise<JournalEntry | null> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select(SHARED_ENTRY_COLUMNS)
    .eq("share_token", token)
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as JournalEntry | null;
}

