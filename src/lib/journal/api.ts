import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type JournalEntry = Database["public"]["Tables"]["journal_entries"]["Row"];
export type JournalTag = Database["public"]["Tables"]["journal_tags"]["Row"];
export type JournalAttachment = Database["public"]["Tables"]["journal_attachments"]["Row"];
export type JournalHistory = Database["public"]["Tables"]["journal_history"]["Row"];
export type JournalTaxonomy = Database["public"]["Tables"]["journal_taxonomy"]["Row"];

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

/* Tags */

export async function fetchTags(): Promise<JournalTag[]> {
  const { data, error } = await supabase.from("journal_tags").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function upsertTag(input: {
  userId: string;
  name: string;
  color?: string;
}): Promise<JournalTag> {
  const { data, error } = await supabase
    .from("journal_tags")
    .upsert(
      { user_id: input.userId, name: input.name.trim(), color: input.color ?? "#3b82f6" },
      { onConflict: "user_id,name" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
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

/* Taxonomy (custom setups / emotions / mistakes) */

export async function fetchTaxonomy(): Promise<JournalTaxonomy[]> {
  const { data, error } = await supabase.from("journal_taxonomy").select("*").order("label");
  if (error) throw error;
  return data ?? [];
}

export async function upsertTaxonomy(input: {
  userId: string;
  kind: "setup" | "emotion" | "mistake";
  label: string;
  color?: string;
}): Promise<JournalTaxonomy> {
  const value = input.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const { data, error } = await supabase
    .from("journal_taxonomy")
    .upsert(
      {
        user_id: input.userId,
        kind: input.kind,
        value,
        label: input.label.trim(),
        color: input.color ?? null,
      },
      { onConflict: "user_id,kind,value" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTaxonomy(id: string): Promise<void> {
  const { error } = await supabase.from("journal_taxonomy").delete().eq("id", id);
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

