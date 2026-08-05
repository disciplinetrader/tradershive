import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      activity_type: z.enum(["replay", "trading", "journal", "battle", "ai_homework"]),
      duration_seconds: z.number().int().min(0),
      metadata: z.record(z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Record the activity log
    const { error: logError } = await supabase.from("activity_logs").insert({
      user_id: userId,
      activity_type: data.activity_type,
      duration_seconds: data.duration_seconds,
      metadata: data.metadata || {},
    });

    if (logError) throw logError;

    // Record the activity for streak calculation
    const { error: streakError } = await supabase.rpc("record_practice_activity", {
      _user_id: userId,
      _activity_type: data.activity_type,
      _metadata: data.metadata || {},
    });

    if (streakError) throw streakError;

    return { ok: true };
  });

export const logHistoricalMarketReplayed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      session_id: z.string().uuid(),
      symbol: z.string(),
      start_ts: z.string(),
      end_ts: z.string(),
      duration_seconds: z.number().int().min(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase.from("historical_market_replayed").insert({
      user_id: userId,
      session_id: data.session_id,
      symbol: data.symbol,
      start_ts: data.start_ts,
      end_ts: data.end_ts,
      duration_seconds: data.duration_seconds,
    });

    if (error) throw error;
    return { ok: true };
  });
