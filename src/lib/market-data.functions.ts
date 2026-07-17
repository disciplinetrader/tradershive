/**
 * Market Data server functions — user-scoped preferences, favorites, alerts,
 * and admin health snapshots. Live prices/candles are pulled client-side
 * through the engine (no need to proxy public data through the server).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const symbolSchema = z.object({ symbol: z.string().min(1).max(32) });

export const getMarketSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_market_settings").select("*").eq("user_id", context.userId).maybeSingle();
    return data ?? null;
  });

export const upsertMarketSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    preferred_provider: z.string().optional().nullable(),
    preferred_timezone: z.string().optional(),
    preferred_market: z.enum(["forex","crypto","indices","metals","commodities","futures","stocks"]).optional(),
    default_symbol: z.string().optional(),
    default_timeframe: z.enum(["1m","3m","5m","15m","30m","1H","2H","4H","1D","1W","1M"]).optional(),
    streaming_quality: z.enum(["battery","balanced","realtime"]).optional(),
    auto_refresh_seconds: z.number().int().min(1).max(60).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("user_market_settings")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

export const listFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_favorite_symbols").select("*").eq("user_id", context.userId).order("sort_order");
    return data ?? [];
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => symbolSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: existing } = await context.supabase
      .from("user_favorite_symbols").select("id").eq("user_id", context.userId).eq("symbol", data.symbol).maybeSingle();
    if (existing) {
      await context.supabase.from("user_favorite_symbols").delete().eq("id", existing.id);
      return { favorited: false };
    }
    await context.supabase.from("user_favorite_symbols").insert({ user_id: context.userId, symbol: data.symbol });
    return { favorited: true };
  });

export const touchRecent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => symbolSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("user_recent_symbols")
      .upsert({ user_id: context.userId, symbol: data.symbol, viewed_at: new Date().toISOString() }, { onConflict: "user_id,symbol" });
    if (error) throw error;
    return { ok: true };
  });

export const listRecent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_recent_symbols").select("*").eq("user_id", context.userId).order("viewed_at", { ascending: false }).limit(20);
    return data ?? [];
  });

export const listSymbols = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    market: z.enum(["forex","crypto","indices","metals","commodities","futures","stocks"]).optional(),
    q: z.string().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let query = context.supabase.from("symbols").select("*").eq("is_enabled", true).order("is_popular", { ascending: false }).limit(data.limit);
    if (data.market) query = query.eq("market_kind", data.market);
    if (data.q) query = query.or(`symbol.ilike.%${data.q}%,display_name.ilike.%${data.q}%`);
    const { data: rows } = await query;
    return rows ?? [];
  });

export const listProvidersDb = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("market_providers").select("*").order("priority");
    return data ?? [];
  });

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("price_alerts").select("*").eq("user_id", context.userId).order("created_at", { ascending: false });
    return data ?? [];
  });

export const createAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    symbol: z.string().min(1),
    kind: z.enum(["above","below","cross_up","cross_down"]),
    target_price: z.number(),
    note: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("price_alerts").insert({ user_id: context.userId, ...data });
    if (error) throw error;
    return { ok: true };
  });

export const deleteAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await context.supabase.from("price_alerts").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

export const adminSetProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string(), enabled: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("market_providers").update({ is_enabled: data.enabled }).eq("code", data.code);
    if (error) throw error;
    return { ok: true };
  });

export const adminProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");
    const [{ data: providers }, { data: connections }, { data: events }, { data: caches }] = await Promise.all([
      context.supabase.from("market_providers").select("*").order("priority"),
      context.supabase.from("provider_connections").select("*").order("updated_at", { ascending: false }).limit(50),
      context.supabase.from("stream_events").select("*").order("created_at", { ascending: false }).limit(50),
      context.supabase.from("historical_cache").select("id,symbol,timeframe,provider_code,candle_count,fetched_at").order("fetched_at", { ascending: false }).limit(50),
    ]);
    return { providers: providers ?? [], connections: connections ?? [], events: events ?? [], caches: caches ?? [] };
  });
