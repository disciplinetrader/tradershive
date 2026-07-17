import { supabase } from "@/integrations/supabase/client";

const BUCKET = "trade-screenshots";
const TTL = 60 * 60 * 24 * 30; // 30 days

export async function uploadTradeScreenshot(userId: string, tradeId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please upload an image file");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be smaller than 8 MB");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${tradeId}/screenshot-${Date.now()}.${ext || "png"}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;
  return path;
}

export async function removeTradeScreenshot(path: string) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function signTradeScreenshot(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error) return null;
  return data.signedUrl;
}
