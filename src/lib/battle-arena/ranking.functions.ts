import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRankingSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("elo, peak_elo")
      .eq("id", userId)
      .single();

    const { data: lastBattle } = await supabase
      .from("battle_results")
      .select("pnl")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      currentRanking: profile?.elo || 1000,
      peakRanking: profile?.peak_elo || 1000,
      lastDelta: 0, // Placeholder until ranking_delta column exists
      sessionNet: lastBattle?.pnl || 0,
      sessionPeak: 0,
      bestDay: 0,
      worstDay: 0,
    };
  });

export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().default(10) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, elo")
      .order("elo", { ascending: false })
      .limit(data.limit);
    
    return profiles || [];
  });
