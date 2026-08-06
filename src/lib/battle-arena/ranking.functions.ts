import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRankingSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    
    // In a real app, this would be a calculated row or a dedicated table.
    // For now we derive it from battle_results or a session-specific table if exists.
    const { data: profile } = await supabase
      .from("profiles")
      .select("elo, peak_elo")
      .eq("id", userId)
      .single();

    const { data: lastBattle } = await supabase
      .from("battle_results")
      .select("pnl") // Changed from ranking_delta to pnl which definitely exists
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();


    return {
      currentRanking: profile?.elo || 1000,
      peakRanking: profile?.peak_elo || 1000,
      lastDelta: lastBattle?.ranking_delta || 0,
      sessionNet: 0, // Placeholder
      sessionPeak: 0, // Placeholder
      bestDay: 0, // Placeholder
      worstDay: 0, // Placeholder
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
