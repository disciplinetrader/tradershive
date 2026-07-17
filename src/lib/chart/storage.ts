/**
 * Cloud-synced storage for chart layouts, drawings, templates and alerts.
 * All calls flow through the shared Supabase client (RLS enforces ownership).
 */
import { supabase } from "@/integrations/supabase/client";
import type { ChartAlertRow, ChartLayoutRow, Drawing, IndicatorConfig } from "./types";

// Chart tables aren't in the generated types file yet — cast on read/write.
type AnyClient = { from: (t: string) => any };
const db = supabase as unknown as AnyClient;

export async function listLayouts(): Promise<ChartLayoutRow[]> {
  const { data } = await db.from("chart_layouts").select("*").order("updated_at", { ascending: false });
  return (data ?? []) as ChartLayoutRow[];
}

export async function saveLayout(row: Partial<ChartLayoutRow>): Promise<ChartLayoutRow | null> {
  const { data } = await db.from("chart_layouts").upsert(row).select().single();
  return (data ?? null) as ChartLayoutRow | null;
}

export async function deleteLayout(id: string) {
  await db.from("chart_layouts").delete().eq("id", id);
}

export async function duplicateLayout(row: ChartLayoutRow) {
  const { id: _id, ...rest } = row as any;
  return saveLayout({ ...rest, name: `${row.name} (copy)`, is_default: false });
}

export async function listDrawings(symbol: string): Promise<Drawing[]> {
  const { data } = await db.from("chart_drawings").select("*").eq("symbol", symbol);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, tool: r.tool, points: r.points ?? [], color: r.style?.color, text: r.text,
    locked: r.locked, timeframe: r.timeframe,
  }));
}

export async function saveDrawing(symbol: string, d: Drawing, userId: string) {
  await db.from("chart_drawings").upsert({
    id: d.id, user_id: userId, symbol, tool: d.tool, points: d.points,
    text: d.text ?? null, style: { color: d.color ?? null }, locked: d.locked ?? false,
    timeframe: d.timeframe ?? null,
  });
}

export async function deleteDrawing(id: string) {
  await db.from("chart_drawings").delete().eq("id", id);
}

export async function listAlerts(): Promise<ChartAlertRow[]> {
  const { data } = await db.from("chart_alerts").select("*").order("created_at", { ascending: false });
  return (data ?? []) as ChartAlertRow[];
}

export async function saveAlert(row: Partial<ChartAlertRow> & { user_id: string }) {
  const { data } = await db.from("chart_alerts").upsert(row).select().single();
  return (data ?? null) as ChartAlertRow | null;
}

export async function deleteAlert(id: string) {
  await db.from("chart_alerts").delete().eq("id", id);
}

export async function loadPreferences() {
  const { data } = await db.from("chart_preferences").select("*").maybeSingle();
  return data as any;
}

export async function savePreferences(userId: string, prefs: Record<string, unknown>) {
  await db.from("chart_preferences").upsert({ user_id: userId, ...prefs });
}

export async function saveIndicatorSet(userId: string, name: string, indicators: IndicatorConfig[]) {
  const { data } = await db.from("chart_indicator_sets").insert({ user_id: userId, name, indicators }).select().single();
  return data as any;
}

export async function listIndicatorSets() {
  const { data } = await db.from("chart_indicator_sets").select("*").order("updated_at", { ascending: false });
  return (data ?? []) as any[];
}

export async function pushRecentSymbol(userId: string, symbol: string, timeframe: string) {
  await db.from("chart_history").insert({ user_id: userId, symbol, timeframe });
}

export async function listRecentSymbols(limit = 20) {
  const { data } = await db.from("chart_history").select("*").order("viewed_at", { ascending: false }).limit(limit);
  return (data ?? []) as any[];
}

export async function listFavorites() {
  const { data } = await db.from("favorite_symbols").select("*").order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

export async function toggleFavorite(userId: string, symbol: string, on: boolean) {
  if (on) await db.from("favorite_symbols").upsert({ user_id: userId, symbol });
  else await db.from("favorite_symbols").delete().eq("user_id", userId).eq("symbol", symbol);
}

export async function uploadChartScreenshot(userId: string, blob: Blob, name: string): Promise<string | null> {
  const path = `${userId}/${Date.now()}-${name}`;
  const { data, error } = await supabase.storage.from("chart-screenshots").upload(path, blob, { contentType: "image/png" });
  if (error) { console.warn("[chart] screenshot upload failed", error); return null; }
  return data?.path ?? null;
}
