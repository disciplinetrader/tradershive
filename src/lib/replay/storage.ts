import { supabase } from "@/integrations/supabase/client";

const BUCKET = "replay-images";
const TTL = 60 * 60 * 24 * 30;

export async function uploadReplayScreenshot(
  userId: string,
  sessionId: string,
  dataUrl: string,
): Promise<{ path: string; url: string }> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${userId}/${sessionId}/${Date.now()}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/png",
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw error;
  const { data: signed, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (sErr) throw sErr;
  return { path, url: signed.signedUrl };
}

export async function getSignedReplayImage(path: string): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL);
  return data?.signedUrl ?? null;
}
