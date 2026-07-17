/**
 * Server functions for the Provider Configuration System.
 *
 * All privileged: admin gate + service-role client for credential storage.
 * Only booleans (`configured`) and non-secret metadata are ever returned to
 * the client — plaintext credentials never leave the worker.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDER_DESCRIPTORS, DESCRIPTORS_BY_CODE } from "./descriptors";
import type { MarketKind } from "./types";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("Forbidden");
}

/* -------------------------------------------------------------------------- */
/* Descriptors — public read (used by admin UI + setup wizard)                */
/* -------------------------------------------------------------------------- */

export const listProviderDescriptors = createServerFn({ method: "GET" }).handler(async () => {
  return PROVIDER_DESCRIPTORS.map((d) => ({
    code: d.code,
    name: d.name,
    description: d.description,
    website: d.website ?? null,
    markets: d.markets,
    capabilities: d.capabilities,
    credentials: d.credentials,
    publicByDefault: d.publicByDefault,
    comingSoon: !!d.comingSoon,
  }));
});

/* -------------------------------------------------------------------------- */
/* Configured state of every provider (admin-only summary)                    */
/* -------------------------------------------------------------------------- */

export const listProviderConfigurations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: creds }, { data: hp }] = await Promise.all([
      supabaseAdmin.from("provider_credentials").select("provider_code, field_key, updated_at"),
      supabaseAdmin.from("market_providers").select("code, last_health_at, last_health_ok, last_latency_ms"),
    ]);
    const credsByCode = new Map<string, { field_key: string; updated_at: string | null }[]>();
    for (const c of creds ?? []) {
      const list = credsByCode.get(c.provider_code) ?? [];
      list.push({ field_key: c.field_key, updated_at: c.updated_at });
      credsByCode.set(c.provider_code, list);
    }
    const healthByCode = new Map((hp ?? []).map((r) => [r.code, r]));

    return PROVIDER_DESCRIPTORS.map((d) => {
      const stored = credsByCode.get(d.code) ?? [];
      const requiredFields = d.credentials.filter((f) => f.required).map((f) => f.key);
      const configuredKeys = new Set(stored.map((r) => r.field_key));
      const missingRequired = requiredFields.filter((k) => !configuredKeys.has(k));
      const health = healthByCode.get(d.code);
      return {
        code: d.code,
        name: d.name,
        description: d.description,
        markets: d.markets,
        publicByDefault: d.publicByDefault,
        comingSoon: !!d.comingSoon,
        configured: missingRequired.length === 0,
        missingRequired,
        configuredFields: [...configuredKeys],
        health: {
          lastAt: health?.last_health_at ?? null,
          ok: health?.last_health_ok ?? null,
          latencyMs: health?.last_latency_ms ?? null,
        },
      };
    });
  });

/* -------------------------------------------------------------------------- */
/* Credentials — write/delete                                                 */
/* -------------------------------------------------------------------------- */

const saveInput = z.object({
  providerCode: z.string().min(1),
  values: z.record(z.string(), z.string()),
});

export const saveProviderCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const d = DESCRIPTORS_BY_CODE.get(data.providerCode);
    if (!d) throw new Error(`Unknown provider: ${data.providerCode}`);
    const validKeys = new Set(d.credentials.map((c) => c.key));
    const { upsertCredential, deleteCredential } = await import("./credentials.server");
    for (const [k, v] of Object.entries(data.values)) {
      if (!validKeys.has(k)) continue;
      if (v === "" || v == null) {
        await deleteCredential(data.providerCode, k);
      } else {
        await upsertCredential(data.providerCode, k, v, context.userId);
      }
    }
    return { ok: true };
  });

export const deleteProviderCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ providerCode: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("provider_credentials").delete().eq("provider_code", data.providerCode);
    if (error) throw error;
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Market assignments                                                         */
/* -------------------------------------------------------------------------- */

const MARKETS = ["crypto","forex","indices","metals","commodities","futures","stocks"] as const;

export const listMarketAssignments = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("provider_market_assignments")
    .select("market_kind, primary_code, fallback_code, updated_at");
  if (error) throw error;
  return (data ?? []) as { market_kind: MarketKind; primary_code: string | null; fallback_code: string | null; updated_at: string }[];
});

const assignInput = z.object({
  market: z.enum(MARKETS),
  primaryCode: z.string().nullable(),
  fallbackCode: z.string().nullable(),
});

export const setMarketAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => assignInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("provider_market_assignments")
      .upsert({
        market_kind: data.market,
        primary_code: data.primaryCode,
        fallback_code: data.fallbackCode,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "market_kind" });
    if (error) throw error;
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Health check + failover log                                                */
/* -------------------------------------------------------------------------- */

export const testProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ providerCode: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const started = Date.now();
    const result = await probeProvider(data.providerCode);
    const latency = Date.now() - started;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("provider_health_checks").insert({
      provider_code: data.providerCode,
      ok: result.ok, latency_ms: latency,
      error_code: result.ok ? null : (result.errorCode ?? "unknown"),
      error_message: result.ok ? null : (result.error ?? null),
      checked_by: context.userId,
    });
    await supabaseAdmin.from("market_providers")
      .update({ last_health_at: new Date().toISOString(), last_health_ok: result.ok, last_latency_ms: latency })
      .eq("code", data.providerCode);
    return { ok: result.ok, latencyMs: latency, error: result.error ?? null };
  });

export const listProviderHealthChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ providerCode: z.string().optional(), limit: z.number().min(1).max(200).default(50) }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("provider_health_checks")
      .select("id, provider_code, checked_at, ok, latency_ms, error_code, error_message")
      .order("checked_at", { ascending: false })
      .limit(data.limit);
    if (data.providerCode) q = q.eq("provider_code", data.providerCode);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* -------------------------------------------------------------------------- */
/* Provider probes (server-side; use stored credentials)                      */
/* -------------------------------------------------------------------------- */

async function probeProvider(code: string): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
  try {
    switch (code) {
      case "binance": {
        const r = await fetch("https://api.binance.com/api/v3/ping", { method: "GET" });
        return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}`, errorCode: "http" };
      }
      case "twelvedata": {
        const key = process.env.TWELVE_DATA_API_KEY;
        if (!key) return { ok: false, error: "Missing TWELVE_DATA_API_KEY", errorCode: "not_configured" };
        const r = await fetch(`https://api.twelvedata.com/api_usage?apikey=${key}`);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, errorCode: "http" };
        const body = await r.json().catch(() => null);
        if (body?.code && body.code !== 200) return { ok: false, error: body.message ?? "API error", errorCode: "api" };
        return { ok: true };
      }
      case "mock":
        return { ok: true };
      default: {
        // Generic probe: ensure required credentials exist.
        const d = DESCRIPTORS_BY_CODE.get(code);
        if (!d) return { ok: false, error: "Unknown provider", errorCode: "unknown" };
        const { getAllCredentials } = await import("./credentials.server");
        const stored = await getAllCredentials(code);
        const missing = d.credentials.filter((f) => f.required && !stored[f.key]).map((f) => f.key);
        if (missing.length) return { ok: false, error: `Missing: ${missing.join(", ")}`, errorCode: "not_configured" };
        return { ok: true };
      }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e), errorCode: "network" };
  }
}
