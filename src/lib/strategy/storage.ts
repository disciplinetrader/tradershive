import { supabase } from "@/integrations/supabase/client";

export const STRATEGY_BUCKETS = {
  images: "strategy-images",
  files: "strategy-files",
  covers: "strategy-covers",
} as const;

export type StrategyBucket = keyof typeof STRATEGY_BUCKETS;

export async function uploadStrategyAsset(
  bucket: StrategyBucket,
  userId: string,
  strategyId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  const b = STRATEGY_BUCKETS[bucket];
  const ext = file.name.split(".").pop() || "bin";
  const key = `${userId}/${strategyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(b).upload(key, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = await supabase.storage.from(b).createSignedUrl(key, 60 * 60);
  return { path: key, url: data?.signedUrl ?? "" };
}

export async function signStrategyUrl(bucket: StrategyBucket, path: string, expiresSec = 3600): Promise<string> {
  const { data } = await supabase.storage.from(STRATEGY_BUCKETS[bucket]).createSignedUrl(path, expiresSec);
  return data?.signedUrl ?? "";
}
