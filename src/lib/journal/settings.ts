/**
 * Journal-adjacent user settings.
 *
 * `breakeven_band` is a judgement about noise, not a fact about a trade, so it
 * lives on the user rather than the entry: the same +$0.40 result is a scratch
 * for a futures trader and a real win for someone sizing in cents. It is read
 * once per surface and threaded into `buildDataset`, so every metric on that
 * surface agrees about what counts as a win.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];
export type PaperAccount = Database["public"]["Tables"]["paper_accounts"]["Row"];

export const settingsKeys = {
  user: ["user-settings"] as const,
  accounts: ["paper-accounts"] as const,
};

export async function fetchUserSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveBreakevenBand(userId: string, band: number): Promise<UserSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: userId, breakeven_band: Math.max(0, band), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── per-account commission / swap defaults ─────────────────────────────── */

export async function fetchAccounts(): Promise<PaperAccount[]> {
  const { data, error } = await supabase
    .from("paper_accounts")
    .select("*")
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/**
 * Defaults the order ticket pre-fills with. Stored per account because cost
 * structure is a property of the broker being simulated, not of the trader —
 * and a commission silently defaulting to 0 makes every expectancy figure
 * optimistic by exactly the fees the trader forgot to enter.
 */
export async function saveAccountCosts(input: {
  accountId: string;
  default_commission: number;
  default_swap: number;
}): Promise<void> {
  const { error } = await supabase
    .from("paper_accounts")
    .update({
      default_commission: Math.max(0, input.default_commission),
      default_swap: Math.max(0, input.default_swap),
    })
    .eq("id", input.accountId);
  if (error) throw error;
}
