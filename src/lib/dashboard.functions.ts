import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
 * Dashboard layout (widget visibility + collapsed state)
 * ==========================================================*/

export type DashboardLayout = {
  hidden: string[];
  collapsed: string[];
  updatedAt?: string;
};

export const DEFAULT_LAYOUT: DashboardLayout = { hidden: [], collapsed: [] };

export const getDashboardLayout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dashboard_layouts")
      .select("layout, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const layout = (data?.layout as Partial<DashboardLayout> | null) ?? null;
    return {
      hidden: Array.isArray(layout?.hidden) ? (layout!.hidden as string[]) : [],
      collapsed: Array.isArray(layout?.collapsed) ? (layout!.collapsed as string[]) : [],
      updatedAt: data?.updated_at ?? null,
    };
  });

const layoutSchema = z.object({
  hidden: z.array(z.string()).default([]),
  collapsed: z.array(z.string()).default([]),
});

export const saveDashboardLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => layoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dashboard_layouts")
      .upsert(
        { user_id: context.userId, layout: data },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

/* ============================================================
 * Quick notes
 * ==========================================================*/

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quick_notes")
      .select("*")
      .eq("user_id", context.userId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

const noteInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(120).default(""),
  content: z.string().max(5000).default(""),
  color: z.string().max(20).default("emerald"),
  pinned: z.boolean().default(false),
});

export const upsertNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => noteInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    if (data.id) {
      const { error } = await context.supabase
        .from("quick_notes")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("quick_notes")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quick_notes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============================================================
 * Watchlists
 * ==========================================================*/

export const listWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Ensure a default watchlist exists
    let { data: lists, error } = await context.supabase
      .from("watchlists")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!lists || lists.length === 0) {
      const { data: created, error: cErr } = await context.supabase
        .from("watchlists")
        .insert({ user_id: context.userId, name: "My Watchlist", market: "forex", is_default: true })
        .select("*")
        .single();
      if (cErr) throw cErr;
      lists = [created];
    }
    const listIds = lists.map((l) => l.id);
    const { data: items, error: iErr } = await context.supabase
      .from("watchlist_items")
      .select("*")
      .in("watchlist_id", listIds)
      .order("favorite", { ascending: false })
      .order("sort_order", { ascending: true });
    if (iErr) throw iErr;
    return { lists, items: items ?? [] };
  });

const addItemInput = z.object({
  watchlist_id: z.string().uuid(),
  symbol: z.string().min(1).max(20),
  market: z.string().min(1).max(20),
});

export const addWatchlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("watchlist_items").upsert(
      {
        watchlist_id: data.watchlist_id,
        user_id: context.userId,
        symbol: data.symbol.toUpperCase(),
        market: data.market,
      },
      { onConflict: "watchlist_id,symbol" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const removeWatchlistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("watchlist_items")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleWatchlistFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), favorite: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("watchlist_items")
      .update({ favorite: data.favorite })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============================================================
 * Dashboard overview (real aggregates from paper_trades)
 * ==========================================================*/

type OverviewTrade = {
  id: string;
  pair: string;
  direction: "long" | "short";
  entry: number;
  exit: number | null;
  rr: number;
  pnl: number;
  duration: string;
  status: "win" | "loss" | "breakeven";
  openedAt: string;
};

function fmtDuration(opened: string, closed: string | null): string {
  if (!closed) return "—";
  const s = Math.max(0, Math.floor((new Date(closed).getTime() - new Date(opened).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}

function sessionOf(iso: string): "Asia" | "London" | "NY" {
  const h = new Date(iso).getUTCHours();
  if (h < 7) return "Asia";
  if (h < 12) return "London";
  return "NY";
}

export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: acct } = await context.supabase
      .from("paper_accounts")
      .select("id, balance, equity, starting_balance")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const startBal = Number(acct?.starting_balance ?? 10000);
    const equity = Number(acct?.equity ?? startBal);

    const { data: closedRaw } = await context.supabase
      .from("paper_trades")
      .select("id, symbol, direction, entry_price, exit_price, pnl, rr_realized, rr_planned, opened_at, closed_at")
      .eq("user_id", context.userId)
      .eq("status", "closed")
      .is("deleted_at", null)
      .order("closed_at", { ascending: false })
      .limit(200);

    const closed = closedRaw ?? [];

    const recent: OverviewTrade[] = closed.slice(0, 25).map((t: any) => {
      const pnl = Number(t.pnl ?? 0);
      const status: OverviewTrade["status"] =
        pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
      return {
        id: t.id,
        pair: t.symbol,
        direction: t.direction,
        entry: Number(t.entry_price),
        exit: t.exit_price != null ? Number(t.exit_price) : null,
        rr: Number(t.rr_realized ?? t.rr_planned ?? 0),
        pnl,
        duration: fmtDuration(t.opened_at, t.closed_at),
        status,
        openedAt: t.opened_at,
      };
    });

    // Equity curve — last 30 closed days
    const byDay = new Map<string, number>();
    for (const t of closed) {
      if (!t.closed_at) continue;
      const d = new Date(t.closed_at).toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + Number(t.pnl ?? 0));
    }
    const dayKeys = Array.from(byDay.keys()).sort();
    let running = startBal;
    const equityPoints = dayKeys.map((d) => {
      running += byDay.get(d)!;
      return { date: d.slice(5), equity: Math.round(running) };
    });
    if (equityPoints.length === 0) {
      equityPoints.push({ date: new Date().toISOString().slice(5, 10), equity: Math.round(equity) });
    }

    // Weekly (last 7 days by weekday label)
    const now = new Date();
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return { day: weekdays[d.getUTCDay()], pnl: Math.round(byDay.get(key) ?? 0) };
    });

    // Monthly (last 4 weeks)
    const monthly = Array.from({ length: 4 }, (_, i) => {
      const end = new Date(now);
      end.setUTCDate(now.getUTCDate() - i * 7);
      const start = new Date(end);
      start.setUTCDate(end.getUTCDate() - 6);
      let sum = 0;
      for (const t of closed) {
        if (!t.closed_at) continue;
        const ts = new Date(t.closed_at).getTime();
        if (ts >= start.getTime() && ts <= end.getTime()) sum += Number(t.pnl ?? 0);
      }
      return { week: `W${4 - i}`, pnl: Math.round(sum) };
    }).reverse();

    // Sessions
    const sessMap: Record<string, number> = { Asia: 0, London: 0, NY: 0 };
    for (const t of closed) {
      if (!t.opened_at) continue;
      sessMap[sessionOf(t.opened_at)] += Number(t.pnl ?? 0);
    }
    const sessions = Object.entries(sessMap).map(([session, pnl]) => ({ session, pnl: Math.round(pnl) }));

    // RR distribution
    const buckets = [
      { bucket: "<0.5R", min: -Infinity, max: 0.5 },
      { bucket: "0.5-1R", min: 0.5, max: 1 },
      { bucket: "1-2R", min: 1, max: 2 },
      { bucket: "2-3R", min: 2, max: 3 },
      { bucket: ">3R", min: 3, max: Infinity },
    ];
    const rrDist = buckets.map((b) => ({
      bucket: b.bucket,
      count: closed.filter((t: any) => {
        const r = Math.abs(Number(t.rr_realized ?? t.rr_planned ?? 0));
        return r >= b.min && r < b.max;
      }).length,
    }));

    const wins = closed.filter((t: any) => Number(t.pnl ?? 0) > 0).length;
    const losses = closed.filter((t: any) => Number(t.pnl ?? 0) < 0).length;
    const be = closed.length - wins - losses;
    const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0;

    return {
      account: { balance: Number(acct?.balance ?? startBal), equity, startingBalance: startBal },
      recentTrades: recent,
      equityPoints,
      weekly,
      monthly,
      sessions,
      rrDistribution: rrDist,
      winsLosses: { wins, losses, be },
      winRate,
      totalTrades: closed.length,
    };
  });

/* ============================================================
 * Notifications (real, from campaigns delivered to this user)
 * ==========================================================*/

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_recipients")
      .select("id, read_at, created_at, notification_campaigns(id, title, body, channel, sent_at)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      title: r.notification_campaigns?.title ?? "Notification",
      description: r.notification_campaigns?.body ?? "",
      type: (r.notification_campaigns?.category ?? "system") as string,
      read: !!r.read_at,
      createdAt: r.created_at,
    }));
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notification_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });
