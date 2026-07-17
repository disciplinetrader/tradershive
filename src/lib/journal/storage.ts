import { supabase } from "@/integrations/supabase/client";

export const JOURNAL_IMAGES_BUCKET = "journal-images";
export const JOURNAL_FILES_BUCKET = "journal-files";

const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

export function detectKind(file: File): "image" | "pdf" | "video" | "other" {
  const t = file.type || "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t === "application/pdf") return "pdf";
  return "other";
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
}

/** Owner path convention required by RLS: `<userId>/<entryId>/<file>` */
function objectPath(userId: string, entryId: string, file: File): string {
  return `${userId}/${entryId}/${Date.now()}-${safeName(file.name || "file")}`;
}

export async function uploadJournalImage(
  userId: string,
  entryId: string,
  file: File,
): Promise<{ bucket: string; path: string; url: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Please upload an image file");
  if (file.size > 15 * 1024 * 1024) throw new Error("Image must be smaller than 15 MB");
  const path = objectPath(userId, entryId, file);
  const { error } = await supabase.storage
    .from(JOURNAL_IMAGES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
  if (error) throw error;
  const url = await getSignedUrl(JOURNAL_IMAGES_BUCKET, path);
  return { bucket: JOURNAL_IMAGES_BUCKET, path, url };
}

export async function uploadJournalFile(
  userId: string,
  entryId: string,
  file: File,
): Promise<{ bucket: string; path: string; url: string; kind: "image" | "pdf" | "video" | "other" }> {
  if (file.size > 50 * 1024 * 1024) throw new Error("File must be smaller than 50 MB");
  const kind = detectKind(file);
  const bucket = kind === "image" ? JOURNAL_IMAGES_BUCKET : JOURNAL_FILES_BUCKET;
  const path = objectPath(userId, entryId, file);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: "3600" });
  if (error) throw error;
  const url = await getSignedUrl(bucket, path);
  return { bucket, path, url, kind };
}

export async function getSignedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeJournalObject(bucket: string, path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

/** Best-effort: batch sign multiple URLs, returns map of path -> signed url. */
export async function batchSignUrls(
  bucket: string,
  paths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL);
  data?.forEach((row) => {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  });
  return out;
}
