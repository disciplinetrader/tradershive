import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "@/lib/server-errors";
import { PROP_PRESETS, type PropPresetId } from "./prop-challenges/presets";
import { evaluateChallenge, type PropChallengeRow, type PropChallengeDayRow } from "./prop-challenges/evaluator";

/* ---------------- Schemas ---------------- */

const presetIds = ["ftmo","apex","topstep","fivepercenters","fundednext","myfundedfx","custom"] as const;

const createSchema = z.object({
 name: z.string().trim().min(1).max(80),
 preset: z.enum(presetIds).default("custom"),
 paper_account_id: z.string().uuid().nullable().optional(),
 account_size: z.number().positive().max(10_000_000),
 currency: z.string().length(3).default("USD"),
 profit_target_pct: z.number().min(0.1).max(100),
 max_daily_loss_pct: z.number().min(0.1).max(100),
 max_total_drawdown_pct: z.number().min(0.1).max(100),
 min_trading_days: z.number().int().min(0).max(365),
 leverage: z.number().int().min(1).max(500),
 duration_days: z.number().int().min(1).max(365),
 commission_per_lot: z.number().min(0).max.default(0),
 spread_profile: z.enum(["tight","standard","wide"]).default("standard"),
 slippage_profile: z.enum(["none","standard","aggressive"]).default("standard"),
 weekend_hold_allowed: z.boolean().default(true),
 news_trading_allowed: z.boolean().default(true),
});

/* ---------------- Queries ---------------- */

export const listPropChallenges = createServerFn({ method: "GET" })
 .middleware([requireSupabaseAuth])
 .handler(async ({ context }) => {
 const { data, error } = await context.supabase
 .from("prop_challenges")
 .select("*")
 .order("started_at", { ascending: false });
 if (error) throw error;
 return (data ?? []) as PropChallengeRow[];
 });

export const getPropChallenge = createServerFn({ method: "GET" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
 const { data: c, error } = await context.supabase
 .from("prop_challenges").select("*").eq("id", data.id).single();
 if (error) throw error;
 const { data: days, error: dErr } = await context.supabase
 .from("prop_challenge_days").select("*").eq("challenge_id", data.id)
 .order("day_date", { ascending: true });
 if (dErr) throw dErr;

 // Pull live equity from linked paper account if any.
 let liveEquity = Number((c as PropChallengeRow).current_equity);
 const paperId = (c as { paper_account_id: string | null }).paper_account_id;
 if (paperId) {
 const { data: acct } = await context.supabase
 .from("paper_accounts").select("equity").eq("id", paperId).maybeSingle();
 if (acct?.equity != null) liveEquity = Number(acct.equity);
 }

 const progress = evaluateChallenge(c as PropChallengeRow, (days ?? []) as PropChallengeDayRow[], liveEquity);
 return {
 challenge: c as PropChallengeRow,
 days: (days ?? []) as PropChallengeDayRow[],
 liveEquity,
 progress,
 };
 });

/* ---------------- Mutations ---------------- */

export const createPropChallenge = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d) => createSchema.parse(d))
 .handler(async ({ data, context }) => {
 const startedAt = new Date();
 const endsAt = new Date(startedAt.getTime() + data.duration_days * 86_400_000);

 // Duplicate guard — one active challenge per name.
 const { data: dupe } = await context.supabase
 .from("prop_challenges")
 .select("id")
 .eq("status", "active")
 .eq("name", data.name)
 .maybeSingle();
 if (dupe) {
 throw new AppError({
 code: "conflict",
 status: 409,
 message: `You already have an active challenge named "${data.name}".`,
 });
 }

 // Every challenge trades against exactly one linked paper account. If the
 // user did not pick one, provision a dedicated account sized to the rules.
 let paperAccountId = data.paper_account_id ?? null;
 if (!paperAccountId) {
 const { data: acct, error: aErr } = await context.supabase
 .from("paper_accounts")
 .insert({
 user_id: context.userId,
 name: `${data.name} — Prop account`,
 currency: data.currency,
 starting_balance: data.account_size,
 balance: data.account_size,
 equity: data.account_size,
 leverage: data.leverage,
 max_trade_risk_pct: Math.min(data.max_daily_loss_pct, 99),
 max_daily_risk_pct: Math.min(data.max_daily_loss_pct, 99),
 })
 .select("id")
 .single();
 if (aErr) throw aErr;
 paperAccountId = acct.id as string;
 }

 const insert = {
 user_id: context.userId,
 paper_account_id: paperAccountId,
 name: data.name,
 preset: data.preset,
 account_size: data.account_size,
 currency: data.currency,
 profit_target_pct: data.profit_target_pct,
 max_daily_loss_pct: data.max_daily_loss_pct,
 max_total_drawdown_pct: data.max_total_drawdown_pct,
 min_trading_days: data.min_trading_days,
 leverage: data.leverage,
 duration_days: data.duration_days,
 commission_per_lot: data.commission_per_lot,
 spread_profile: data.spread_profile,
 slippage_profile: data.slippage_profile,
 weekend_hold_allowed: data.weekend_hold_allowed,
 news_trading_allowed: data.news_trading_allowed,
 status: "active",
 started_at: startedAt.toISOString(),
 ends_at: endsAt.toISOString(),
 starting_equity: data.account_size,
 current_equity: data.account_size,
 peak_equity: data.account_size,
 lowest_equity: data.account_size,
 };

 const { data: row, error } = await context.supabase
 .from("prop_challenges").insert(insert).select().single();
 if (error) throw error;
 return row as PropChallengeRow;
 });


export const abandonPropChallenge = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
 // Verify ownership before the destructive update
 const { data: chal, error: fetchErr } = await context.supabase
 .from("prop_challenges")
 .select("user_id")
 .eq("id", data.id)
 .maybeSingle();
 if (fetchErr) throw fetchErr;
 if (!chal) throw new Error("Challenge not found");
 if (chal.user_id !== context.userId) {
 throw new Error("You do not own this challenge");
 }

 const { error } = await context.supabase
 .from("prop_challenges")
 .update({ status: "abandoned", completed_at: new Date().toISOString() })
 .eq("id", data.id);
 if (error) throw error;
 return { ok: true };
 });

export const deletePropChallenge = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
 // Verify ownership before the destructive delete
 const { data: chal, error: fetchErr } = await context.supabase
 .from("prop_challenges")
 .select("user_id")
 .eq("id", data.id)
 .maybeSingle();
 if (fetchErr) throw fetchErr;
 if (!chal) throw new Error("Challenge not found");
 if (chal.user_id !== context.userId) {
 throw new Error("You do not own this challenge");
 }

 const { error } = await context.supabase.from("prop_challenges").delete().eq("id", data.id);
 if (error) throw error;
 return { ok: true };
 });

/**
 * Tick a challenge: recompute equity, drawdown, daily P/L and status from
 * the linked paper account + today's realized trades. Called from the HUD
 * on an interval and after every trade close.
 */
export const tickPropChallenge = createServerFn({ method: "POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
 const { data: c, error } = await context.supabase
 .from("prop_challenges").select("*").eq("id", data.id).single();
 if (error) throw error;
 const chal = c as PropChallengeRow & { paper_account_id: string | null };
 // Ownership guard — server-side, not relying on RLS alone
 if (chal.user_id !== context.userId) {
 throw new Error("You do not own this challenge");
 }
 if (chal.status !== "active") return { skipped: true, status: chal.status };

 let equity = Number(chal.current_equity);
 if (chal.paper_account_id) {
 const { data: acct } = await context.supabase
 .from("paper_accounts").select("equity, balance").eq("id", chal.paper_account_id).maybeSingle();
 if (acct?.equity != null) equity = Number(acct.equity);
 }

 const today = new Date().toISOString().slice(0, 10);
 const { data: existingDay } = await context.supabase
 .from("prop_challenge_days").select("*")
 .eq("challenge_id", chal.id).eq("day_date", today).maybeSingle();

 const { data: prevDay } = await context.supabase
 .from("prop_challenge_days").select("end_equity")
 .eq("challenge_id", chal.id).lt("day_date", today)
 .order("day_date", { ascending: false }).limit(1).maybeSingle();
 const startEq = existingDay?.start_equity != null
 ? Number(existingDay.start_equity)
 : prevDay?.end_equity != null ? Number(prevDay.end_equity) : Number(chal.starting_equity);

 // Trades today from linked paper account.
 let tradesToday = existingDay?.trades_count ?? 0;
 let realizedToday = existingDay?.realized_pnl != null ? Number(existingDay.realized_pnl) : 0;
 if (chal.paper_account_id) {
 const dayStart = `${today}T00:00:00.000Z`;
 const { data: trades } = await context.supabase
 .from("paper_trades").select("pnl")
 .eq("account_id", chal.paper_account_id).eq("status", "closed")
 .gte("closed_at", dayStart);
 const list = trades ?? [];
 tradesToday = list.length;
 realizedToday = list.reduce((a: number, t: { pnl: number | null }) => a + Number(t.pnl ?? 0), 0);
 }

 const high = Math.max(Number(existingDay?.high_equity ?? startEq), equity);
 const low = Math.min(Number(existingDay?.low_equity ?? startEq), equity);
 const peak = Math.max(Number(chal.peak_equity), equity);
 const lowest = Math.min(Number(chal.lowest_equity), equity);

 // Evaluate breaches inline using fresh numbers.
 const dailyLossLimit = startEq * (chal.max_daily_loss_pct / 100);
 const dailyLoss = Math.max(0, startEq - equity);
 const ddLimit = Number(chal.starting_equity) * (chal.max_total_drawdown_pct / 100);
 const drawdown = Math.max(0, peak - equity);

 let breach: { code: string; message: string } | undefined;
 if (dailyLoss > dailyLossLimit) {
 breach = { code: "daily_loss", message: `Daily loss ${(dailyLoss / startEq * 100).toFixed(2)}% exceeds limit of ${chal.max_daily_loss_pct}%` };
 } else if (drawdown > ddLimit) {
 breach = { code: "max_drawdown", message: `Overall drawdown ${(drawdown / Number(chal.starting_equity) * 100).toFixed(2)}% exceeds ${chal.max_total_drawdown_pct}%` };
 }

 const profit = equity - Number(chal.starting_equity);
 const target = Number(chal.starting_equity) * (chal.profit_target_pct / 100);
 const { count: distinctDays } = await context.supabase
 .from("prop_challenge_days").select("day_date", { head: true, count: "exact" })
 .eq("challenge_id", chal.id).gt("trades_count", 0);
 const daysUsed = (distinctDays ?? 0) + (tradesToday > 0 && !existingDay?.trades_count ? 1 : 0);

 let nextStatus: PropChallengeRow["status"] = chal.status;
 let result: string | null = null;
 let breachReason: string | null = null;
 let completedAt: string | null = null;

 if (breach) {
 nextStatus = "failed";
 result = "failed";
 breachReason = breach.message;
 completedAt = new Date().toISOString();
 } else if (profit >= target && daysUsed >= chal.min_trading_days) {
 nextStatus = "passed";
 result = "passed";
 completedAt = new Date().toISOString();
 }

 // Upsert the day snapshot.
 await context.supabase.from("prop_challenge_days").upsert({
 challenge_id: chal.id,
 user_id: context.userId,
 day_date: today,
 start_equity: startEq,
 end_equity: equity,
 high_equity: high,
 low_equity: low,
 realized_pnl: realizedToday,
 trades_count: tradesToday,
 breached: !!breach,
 breach_code: breach?.code ?? null,
 }, { onConflict: "challenge_id,day_date" });

 // Update the challenge record.
 await context.supabase.from("prop_challenges").update({
 current_equity: equity,
 peak_equity: peak,
 lowest_equity: lowest,
 realized_pnl: equity - Number(chal.starting_equity),
 trading_days_used: daysUsed,
 status: nextStatus,
 result,
 breach_reason: breachReason,
 breach_at: breach ? new Date().toISOString() : chal.breach_at,
 completed_at: completedAt ?? chal.completed_at,
 }).eq("id", chal.id);

 return { ok: true, status: nextStatus, breach: breach ?? null };
 });

export const listPresets = createServerFn({ method: "GET" })
 .handler(async () => Object.values(PROP_PRESETS));

export type { PropChallengeRow, PropChallengeDayRow, PropPresetId };
