import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyseMistakes } from "./mistakes/engine";
import { DEFAULT_LIMITS, type NormalizedTrade, type UserRiskLimits } from "./mistakes/types";

const schema = z.object({
  rangeDays: z.number().int().positive().max(365).optional(),
}).default({});

export const getMistakeAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const rangeDays = data.rangeDays ?? 30;
    const since = new Date(Date.now() - rangeDays * 86400_000).toISOString();

    const [{ data: journal }, { data: paper }, { data: runs }, { data: strategies }, { data: prefs }] = await Promise.all([
      context.supabase
        .from("journal_entries")
        .select("id,symbol,direction,session,strategy_id,strategy,lot_size,entry_price,stop_loss,take_profit,exit_price,pnl,rr,risk_pct,reward_pct,opened_at,closed_at,duration_seconds,emotions,mistakes,mistake_flags,notes_text,entry_reason_text,screenshots,status")
        .eq("user_id", context.userId).is("deleted_at", null)
        .gte("opened_at", since),
      context.supabase
        .from("paper_trades")
        .select("id,symbol,direction,strategy_id,lot_size,entry_price,stop_loss,take_profit,exit_price,pnl,rr_realized,rr_planned,risk_amount,opened_at,closed_at,notes,screenshot_path,status")
        .eq("user_id", context.userId).is("deleted_at", null)
        .gte("opened_at", since),
      context.supabase
        .from("strategy_checklist_runs")
        .select("strategy_id,context_ref_id,all_required_passed,created_at")
        .eq("user_id", context.userId)
        .gte("created_at", since),
      context.supabase
        .from("strategies")
        .select("id,name")
        .eq("user_id", context.userId),
      context.supabase
        .from("user_preferences")
        .select("risk_per_trade_pct")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    const stratName = new Map<string, string>((strategies ?? []).map((s: any) => [s.id, s.name]));
    const runByRef = new Set<string>((runs ?? []).filter((r: any) => r.context_ref_id).map((r: any) => r.context_ref_id!));

    const normalized: NormalizedTrade[] = [
      ...(journal ?? []).map((j: any): NormalizedTrade => ({
        id: j.id,
        source: "journal",
        symbol: j.symbol,
        direction: normDir(j.direction),
        status: (j.status ?? "closed") as any,
        opened_at: j.opened_at,
        closed_at: j.closed_at,
        duration_seconds: j.duration_seconds,
        session: normSession(j.session),
        strategy_id: j.strategy_id,
        strategy_name: j.strategy_id ? (stratName.get(j.strategy_id) ?? j.strategy ?? null) : (j.strategy ?? null),
        lot_size: n(j.lot_size),
        entry: n(j.entry_price),
        stop_loss: n(j.stop_loss),
        take_profit: n(j.take_profit),
        exit: n(j.exit_price),
        pnl: n(j.pnl),
        rr: n(j.rr),
        rr_planned: null,
        risk_pct: n(j.risk_pct),
        emotions: Array.isArray(j.emotions) ? j.emotions : [],
        mistake_flags: Array.isArray(j.mistakes) ? j.mistakes : [],
        checklist_ran: j.strategy_id ? runByRef.has(j.id) : true,
        has_screenshots: Array.isArray(j.screenshots) && j.screenshots.length > 0,
        has_notes: !!(j.notes_text || j.entry_reason_text),
        outcome: outcomeOf(n(j.rr), n(j.pnl)),
      })),
      ...(paper ?? []).map((p: any): NormalizedTrade => ({
        id: p.id,
        source: "paper",
        symbol: p.symbol,
        direction: normDir(p.direction),
        status: p.status,
        opened_at: p.opened_at,
        closed_at: p.closed_at,
        duration_seconds: (p.opened_at && p.closed_at) ? (new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime()) / 1000 : null,
        session: null,
        strategy_id: p.strategy_id,
        strategy_name: p.strategy_id ? (stratName.get(p.strategy_id) ?? null) : null,
        lot_size: n(p.lot_size),
        entry: n(p.entry_price),
        stop_loss: n(p.stop_loss),
        take_profit: n(p.take_profit),
        exit: n(p.exit_price),
        pnl: n(p.pnl),
        rr: n(p.rr_realized),
        rr_planned: n(p.rr_planned),
        risk_pct: null,
        emotions: [],
        mistake_flags: [],
        checklist_ran: p.strategy_id ? runByRef.has(p.id) : true,
        has_screenshots: !!p.screenshot_path,
        has_notes: !!(p.notes && String(p.notes).trim().length),
        outcome: outcomeOf(n(p.rr_realized), n(p.pnl)),
      })),
    ];

    const limits: UserRiskLimits = {
      ...DEFAULT_LIMITS,
      max_risk_per_trade_pct: Number(prefs?.risk_per_trade_pct ?? DEFAULT_LIMITS.max_risk_per_trade_pct),
    };
    return analyseMistakes(normalized, limits, rangeDays);
  });

function n(v: any): number | null { if (v == null) return null; const x = Number(v); return Number.isFinite(x) ? x : null; }
function normDir(d: any): "long" | "short" | null {
  const s = String(d ?? "").toLowerCase();
  if (["long", "buy"].includes(s)) return "long";
  if (["short", "sell"].includes(s)) return "short";
  return null;
}
function normSession(s: any): string | null {
  const v = String(s ?? "").toLowerCase();
  if (!v) return null;
  if (v.startsWith("lon")) return "London";
  if (v.startsWith("ny") || v.startsWith("new")) return "New York";
  if (v.startsWith("asia") || v.startsWith("tok")) return "Asia";
  return String(s);
}
function outcomeOf(r: number | null, pnl: number | null): "win" | "loss" | "breakeven" {
  const v = r ?? pnl ?? 0;
  if (v > 0) return "win";
  if (v < 0) return "loss";
  return "breakeven";
}
function extractLimits(prefs: any): UserRiskLimits {
  if (!prefs || typeof prefs !== "object") return DEFAULT_LIMITS;
  const p = prefs as Record<string, any>;
  return {
    max_risk_per_trade_pct: Number(p.max_risk_per_trade_pct ?? DEFAULT_LIMITS.max_risk_per_trade_pct),
    daily_loss_limit_r: Number(p.daily_loss_limit_r ?? DEFAULT_LIMITS.daily_loss_limit_r),
    max_consecutive_losses: Number(p.max_consecutive_losses ?? DEFAULT_LIMITS.max_consecutive_losses),
  };
}
