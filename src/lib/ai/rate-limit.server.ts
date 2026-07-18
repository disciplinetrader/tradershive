import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AiTier = "free" | "pro" | "admin";
export type AiBucket = "chat_per_hour" | "chat_per_day" | "review_per_day";

type TierLimits = Record<AiBucket, number>;

const FALLBACK: Record<AiTier, TierLimits> = {
  free: { chat_per_hour: 30, chat_per_day: 150, review_per_day: 10 },
  pro: { chat_per_hour: 180, chat_per_day: 1500, review_per_day: 120 },
  admin: { chat_per_hour: 100_000, chat_per_day: 100_000, review_per_day: 100_000 },
};

let cachedConfig: { at: number; value: Record<AiTier, TierLimits> } | null = null;
const CONFIG_TTL_MS = 60_000;

async function loadConfig(
  supabase: SupabaseClient<Database>,
): Promise<Record<AiTier, TierLimits>> {
  if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_TTL_MS) return cachedConfig.value;
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "ai.rate_limits")
      .maybeSingle();
    const value = (data?.value as Record<AiTier, TierLimits> | null) ?? FALLBACK;
    cachedConfig = { at: Date.now(), value };
    return value;
  } catch {
    return FALLBACK;
  }
}

export async function detectTier(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AiTier> {
  const { data } = await supabase.rpc("is_platform_admin", { _user_id: userId });
  if (data === true) return "admin";
  // Pro detection would read a billing/subscription table — none exists yet.
  return "free";
}

export type RateLimitCheck =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; retryAfterSec: number; limit: number; used: number };

function windowStartFor(bucket: AiBucket): { start: Date; retryAfterSec: number } {
  const now = new Date();
  if (bucket.endsWith("per_hour")) {
    const start = new Date(now);
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3_600_000);
    return { start, retryAfterSec: Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000)) };
  }
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, retryAfterSec: Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000)) };
}

export async function enforceAiRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  buckets: AiBucket[],
): Promise<RateLimitCheck> {
  const [config, tier] = await Promise.all([loadConfig(supabase), detectTier(supabase, userId)]);
  const tierCfg = config[tier] ?? FALLBACK[tier];
  let minRemaining = Number.POSITIVE_INFINITY;
  let effectiveLimit = 0;
  for (const bucket of buckets) {
    const limit = Number(tierCfg[bucket] ?? FALLBACK[tier][bucket]);
    const { start, retryAfterSec } = windowStartFor(bucket);
    const { data, error } = await supabase.rpc("bump_ai_rate_limit", {
      _user_id: userId,
      _bucket: bucket,
      _window_start: start.toISOString(),
      _limit: limit,
    });
    if (error) continue;
    const row = Array.isArray(data) ? data[0] : (data as any);
    if (!row?.allowed) {
      return { ok: false, retryAfterSec, limit, used: Number(row?.current_count ?? limit) };
    }
    if (Number(row.remaining) < minRemaining) {
      minRemaining = Number(row.remaining);
      effectiveLimit = limit;
    }
  }
  return {
    ok: true,
    remaining: Number.isFinite(minRemaining) ? minRemaining : effectiveLimit,
    limit: effectiveLimit,
  };
}
