/**
 * Phase 9 · challenge server functions.
 *
 * Challenge truth is server-side: the client never computes status. Every
 * instance freezes the template it started with, so later template edits
 * cannot rewrite a running or historical challenge.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BUILT_IN_TEMPLATES,
  findBuiltInTemplate,
  makeTemplate,
  type ChallengeTemplate,
} from "./challenge/model";
import {
  CHALLENGE_EVALUATOR_VERSION,
  evaluateChallenge,
  type ChallengeFacts,
  type EquityPoint,
  type EvaluatorTrade,
} from "./challenge/evaluator";

export const listChallengeTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("challenge_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return {
      builtIn: BUILT_IN_TEMPLATES,
      custom: (data ?? []).map((row: any) => ({ ...(row.rules as ChallengeTemplate), id: row.id, name: row.name, version: row.version })),
    };
  });

const createSchema = z.object({
  template_id: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  starting_balance: z.number().positive().max(10_000_000).optional(),
  account_id: z.string().uuid().optional().nullable(),
  prop_challenge_id: z.string().uuid().optional().nullable(),
  timezone: z.string().max(64).optional(),
});

export const createChallengeInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    let template = findBuiltInTemplate(data.template_id);
    let templateRowId: string | null = null;

    if (!template) {
      const { data: row, error } = await context.supabase
        .from("challenge_templates")
        .select("*")
        .eq("id", data.template_id)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Unknown challenge template");
      templateRowId = row.id;
      template = makeTemplate({ ...(row.rules as any), id: row.id, name: row.name, version: row.version });
    }

    const snapshot: ChallengeTemplate = {
      ...template,
      startingBalance: data.starting_balance ?? template.startingBalance,
      timezone: data.timezone ?? template.timezone,
    };

    const { data: instance, error } = await context.supabase
      .from("challenge_instances")
      .insert({
        user_id: context.userId,
        template_id: templateRowId,
        template_snapshot: snapshot as any,
        template_version: snapshot.version,
        title: data.title ?? snapshot.name,
        account_id: data.account_id ?? null,
        prop_challenge_id: data.prop_challenge_id ?? null,
        evaluator_version: CHALLENGE_EVALUATOR_VERSION,
        audit_log: [{ at: new Date().toISOString(), event: "created", template: snapshot.id, version: snapshot.version }] as any,
      })
      .select()
      .single();
    if (error) throw error;
    return instance;
  });

export const listChallengeInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("challenge_instances")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

/**
 * THE evaluation entry point. Re-derives status from canonical facts,
 * persists the result and records violations idempotently.
 */
export const evaluateChallengeInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: instance, error } = await context.supabase
      .from("challenge_instances")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!instance) throw new Error("Challenge not found");

    const template = instance.template_snapshot as unknown as ChallengeTemplate;

    const { data: rawTrades, error: tradesError } = await context.supabase
      .from("chart_closed_trades")
      .select("id, symbol, entry_time, exit_time, net_pnl, risk_amount")
      .gte("closed_at", new Date(instance.started_at).getTime())
      .order("exit_time", { ascending: true })
      .limit(2000);
    if (tradesError) throw tradesError;

    const trades: EvaluatorTrade[] = (rawTrades ?? []).map((t: any) => ({
      id: t.id,
      symbol: t.symbol,
      entryTime: Number(t.entry_time),
      exitTime: Number(t.exit_time),
      netPnl: Number(t.net_pnl),
      riskAmount: t.risk_amount == null ? null : Number(t.risk_amount),
    }));

    // Canonical equity curve: realised equity after each closed trade. When
    // an account snapshot source exists it should be preferred — until then
    // intraday floating equity is genuinely unknown and rules that need it
    // report "unknown" rather than guessing.
    let running = template.startingBalance;
    const equityPoints: EquityPoint[] = trades.map((t) => {
      running += t.netPnl;
      return { t: t.exitTime, equity: running };
    });

    const facts: ChallengeFacts = {
      startingBalance: template.startingBalance,
      equityPoints,
      closedTrades: trades,
      openPositions: [],
      pendingOrders: 0,
      now: Date.now(),
      timezone: template.timezone,
    };

    const evaluation = evaluateChallenge(template, facts);

    const patch: Record<string, any> = {
      evaluation: JSON.parse(JSON.stringify(evaluation)),
      progress: evaluation.progress as any,
      evaluator_version: evaluation.evaluatorVersion,
    };
    if (evaluation.status === "failed" && !instance.failed_at) {
      patch.status = "failed";
      patch.failed_at = new Date().toISOString();
      patch.failure_reason = evaluation.violations[0]?.label ?? "Rule breach";
    } else if (evaluation.status === "passed" && !instance.passed_at) {
      patch.status = "passed";
      patch.passed_at = new Date().toISOString();
    } else if (!instance.failed_at && !instance.passed_at) {
      patch.status = evaluation.status === "at_risk" ? "at_risk" : evaluation.status === "data_unavailable" ? "active" : "active";
    }

    const { data: updated, error: updateError } = await context.supabase
      .from("challenge_instances")
      .update(patch as never)
      .eq("id", data.id)
      .select()
      .single();
    if (updateError) throw updateError;

    if (evaluation.violations.length) {
      const today = new Date().toISOString().slice(0, 10);
      await context.supabase.from("challenge_violations").upsert(
        evaluation.violations.map((v) => ({
          challenge_id: data.id,
          user_id: context.userId,
          rule_id: v.ruleId,
          rule_version: v.ruleVersion,
          severity: "breach",
          message: v.label,
          current_value: v.currentValue,
          limit_value: v.limit,
          evidence: { evidence: v.evidence } as any,
          occurred_on: today,
        })),
        { onConflict: "challenge_id,rule_id,occurred_on", ignoreDuplicates: true },
      );
    }

    return { instance: updated, evaluation };
  });

export const listChallengeViolations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("challenge_violations")
      .select("*")
      .eq("challenge_id", data.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return rows ?? [];
  });

export const abandonChallengeInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("challenge_instances")
      .update({ status: "abandoned", ended_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["active", "at_risk"]);
    if (error) throw error;
    return { ok: true };
  });
