import { supabase } from "@/integrations/supabase/client";

const AVATAR_BUCKET = "avatars";
const AVATAR_SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

/**
 * Uploads a user avatar to storage and returns a long-lived signed URL.
 * File is stored under `<userId>/avatar-<timestamp>.<ext>`.
 */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be smaller than 5 MB");
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/avatar-${Date.now()}.${ext || "png"}`;

  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (upErr) throw upErr;

  const { data: signed, error: signErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_SIGNED_URL_TTL);
  if (signErr) throw signErr;

  return { path, url: signed.signedUrl };
}

export async function removeAvatarObject(path: string): Promise<void> {
  if (!path) return;
  // Best-effort. If path is a full URL (legacy), skip.
  if (path.startsWith("http")) return;
  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}
