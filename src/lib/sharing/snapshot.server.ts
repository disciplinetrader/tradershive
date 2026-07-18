// Server-only. Builds a shareable snapshot for any source module.
// Verifies ownership. Returns { title, summary, snapshot, cover, tags, symbol, market, direction, category, linked, postType }.

export type ShareSourceType =
  | "trading_workspace"
  | "journal"
  | "battle"
  | "championship"
  | "replay"
  | "strategy"
  | "statistics"
  | "ai_review"
  | "achievement"
  | "challenge"
  | "profile"
  | "custom";

export type ShareSnapshot = {
  title: string;
  summary: string;
  snapshot: Record<string, unknown>;
  cover: string | null;
  tags: string[];
  symbol: string | null;
  market: string | null;
  direction: string | null;
  category: string;
  postType: string;
  linked: {
    linked_trade_id?: string | null;
    linked_journal_id?: string | null;
    linked_replay_id?: string | null;
    linked_strategy_id?: string | null;
    linked_battle_id?: string | null;
  };
};

function fmtN(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function tagsFromSymbol(sym?: string | null): string[] {
  if (!sym) return [];
  return [sym.replace(/[^a-z0-9]/gi, "").toLowerCase()];
}

// supabase is an authenticated client acting as the caller (RLS enforced).
export async function buildShareSnapshot(
  supabase: any,
  userId: string,
  source: ShareSourceType,
  sourceId: string | null,
  sourceRef: string | null,
): Promise<ShareSnapshot> {
  switch (source) {
    case "trading_workspace":
    case "journal": {
      // Prefer journal entry; fall back to raw paper trade
      let entry: any = null;
      if (sourceId) {
        const j = await supabase.from("journal_entries").select("*").eq("id", sourceId).eq("user_id", userId).maybeSingle();
        entry = j.data;
        if (!entry) {
          const t = await supabase.from("paper_trades").select("*").eq("id", sourceId).eq("user_id", userId).maybeSingle();
          entry = t.data ? { ...t.data, trade_id: t.data.id } : null;
        }
      }
      if (!entry) throw new Error("Trade or journal entry not found or not yours.");
      const pnl = entry.pnl ?? 0;
      const rr = entry.rr ?? entry.rr_realized ?? entry.rr_planned ?? 0;
      const title = `${(entry.direction ?? "").toUpperCase()} ${entry.symbol} · ${pnl >= 0 ? "+" : ""}${fmtN(pnl)} (${rr >= 0 ? "+" : ""}${fmtN(rr, 2)}R)`;
      const summary = entry.notes || entry.notes_md || `Closed ${entry.symbol} for ${pnl >= 0 ? "profit" : "loss"}.`;
      return {
        title,
        summary,
        snapshot: {
          symbol: entry.symbol, direction: entry.direction, market: entry.market,
          entry_price: entry.entry_price, exit_price: entry.exit_price,
          stop_loss: entry.stop_loss, take_profit: entry.take_profit,
          lot_size: entry.lot_size, pnl, rr, opened_at: entry.opened_at, closed_at: entry.closed_at,
          duration_seconds: entry.duration_seconds,
          emotions: entry.emotions ?? null, mistakes: entry.mistakes ?? null,
          lessons: entry.lessons_learned ?? null,
        },
        cover: null,
        tags: [...tagsFromSymbol(entry.symbol), source === "journal" ? "journal" : "trade"],
        symbol: entry.symbol ?? null,
        market: entry.market ?? null,
        direction: entry.direction ?? null,
        category: source === "journal" ? "psychology" : (entry.market ?? "price-action"),
        postType: source === "journal" ? "journal" : "trade_idea",
        linked: { linked_trade_id: entry.trade_id ?? sourceId, linked_journal_id: entry.trade_id ? sourceId : null },
      };
    }
    case "battle": {
      if (!sourceId) throw new Error("Battle id required");
      const [b, rank] = await Promise.all([
        supabase.from("battles").select("id, name, battle_type, market, win_condition, starting_balance, status, winner_user_id, start_at, end_at").eq("id", sourceId).maybeSingle(),
        supabase.from("battle_rankings").select("*").eq("battle_id", sourceId).eq("user_id", userId).maybeSingle(),
      ]);
      if (!b.data) throw new Error("Battle not found");
      const battle = b.data; const r = rank.data ?? {};
      const isWinner = battle.winner_user_id === userId;
      const title = isWinner
        ? `🏆 Won ${battle.name} — Rank #${r.rank ?? 1}`
        : `${battle.name} — Rank #${r.rank ?? "?"} · ${r.pnl >= 0 ? "+" : ""}${fmtN(r.pnl)}`;
      return {
        title,
        summary: `${battle.battle_type?.toUpperCase() ?? ""} · ${battle.market ?? ""} · ${battle.win_condition ?? ""}`.trim(),
        snapshot: {
          battle_name: battle.name, battle_type: battle.battle_type, market: battle.market,
          win_condition: battle.win_condition, status: battle.status,
          rank: r.rank, pnl: r.pnl, r_multiple: r.r_multiple, win_rate: r.win_rate,
          trades_count: r.trades_count, max_drawdown: r.max_drawdown, score: r.score,
          is_winner: isWinner,
        },
        cover: null,
        tags: ["battlearena", ...(battle.market ? [battle.market] : []), ...(isWinner ? ["battlechampion"] : [])],
        symbol: null, market: battle.market ?? null, direction: null,
        category: "battle-arena", postType: "battle_result",
        linked: { linked_battle_id: sourceId },
      };
    }
    case "championship": {
      // sourceRef like "2025-11"; snapshot pulls user's monthly stats
      const period = sourceRef || new Date().toISOString().slice(0, 7);
      const from = `${period}-01T00:00:00Z`;
      const [y, m] = period.split("-").map(Number);
      const to = new Date(Date.UTC(y, m, 1)).toISOString();
      const { data: trades } = await supabase
        .from("paper_trades").select("pnl, rr_realized")
        .eq("user_id", userId).eq("status", "closed")
        .gte("closed_at", from).lt("closed_at", to);
      const rows = trades ?? [];
      const pnl = rows.reduce((s: number, r: any) => s + (Number(r.pnl) || 0), 0);
      const wins = rows.filter((r: any) => (r.pnl ?? 0) > 0).length;
      const wr = rows.length ? (wins / rows.length) * 100 : 0;
      const avgR = rows.length ? rows.reduce((s: number, r: any) => s + (Number(r.rr_realized) || 0), 0) / rows.length : 0;
      return {
        title: `🏅 Championship ${period} — ${pnl >= 0 ? "+" : ""}${fmtN(pnl)} (${fmtN(wr, 1)}% WR)`,
        summary: `${rows.length} trades · Avg ${fmtN(avgR, 2)}R`,
        snapshot: { period, trades: rows.length, pnl, win_rate: wr, avg_r: avgR },
        cover: null, tags: ["monthlychampionship", period], symbol: null, market: null, direction: null,
        category: "championship", postType: "tournament_result", linked: {},
      };
    }
    case "replay": {
      if (!sourceId) throw new Error("Replay id required");
      const { data: rep } = await supabase.from("replay_sessions").select("*").eq("id", sourceId).eq("user_id", userId).maybeSingle();
      if (!rep) throw new Error("Replay not found or not yours");
      const { data: score } = await supabase.from("replay_scores").select("*").eq("session_id", sourceId).maybeSingle();
      return {
        title: `Replay: ${rep.name || rep.symbol}`,
        summary: rep.description || `${rep.symbol} · ${rep.timeframe ?? ""} · ${rep.started_at ? new Date(rep.started_at).toLocaleDateString() : ""}`,
        snapshot: {
          symbol: rep.symbol, timeframe: rep.timeframe, started_at: rep.started_at,
          trades: score?.trades_count ?? null, pnl: score?.total_pnl ?? null,
          score: score?.score ?? null, grade: score?.grade ?? null,
        },
        cover: rep.cover_url ?? null, tags: ["replay", ...tagsFromSymbol(rep.symbol)],
        symbol: rep.symbol ?? null, market: rep.market ?? null, direction: null,
        category: "education", postType: "replay",
        linked: { linked_replay_id: sourceId },
      };
    }
    case "strategy": {
      if (!sourceId) throw new Error("Strategy id required");
      const { data: strat } = await supabase.from("strategies").select("*").eq("id", sourceId).eq("user_id", userId).maybeSingle();
      if (!strat) throw new Error("Strategy not found or not yours");
      return {
        title: `Strategy: ${strat.name}` + (strat.version_label ? ` (${strat.version_label})` : ""),
        summary: strat.summary || strat.description || "",
        snapshot: {
          name: strat.name, market: strat.market, style: strat.style, timeframe: strat.timeframe,
          win_rate: strat.performance_win_rate, avg_r: strat.performance_avg_r,
          trades: strat.performance_trades_count, expectancy: strat.performance_expectancy,
          version: strat.version_number,
        },
        cover: strat.cover_url ?? null,
        tags: ["strategy", ...(strat.market ? [strat.market] : []), ...(strat.style ? [strat.style] : [])],
        symbol: null, market: strat.market ?? null, direction: null,
        category: "strategy", postType: "strategy",
        linked: { linked_strategy_id: sourceId },
      };
    }
    case "statistics": {
      // sourceRef "period:from:to" or preset like "month" | "week" | "all"
      const preset = sourceRef || "month";
      const now = new Date();
      let from: Date;
      if (preset === "week") { from = new Date(now); from.setDate(now.getDate() - 7); }
      else if (preset === "all") { from = new Date(0); }
      else { from = new Date(now); from.setMonth(now.getMonth() - 1); }
      const { data: trades } = await supabase
        .from("paper_trades").select("pnl, rr_realized")
        .eq("user_id", userId).eq("status", "closed")
        .gte("closed_at", from.toISOString());
      const rows = trades ?? [];
      const pnl = rows.reduce((s: number, r: any) => s + (Number(r.pnl) || 0), 0);
      const wins = rows.filter((r: any) => (r.pnl ?? 0) > 0).length;
      const losses = rows.length - wins;
      const grossWin = rows.filter((r: any) => (r.pnl ?? 0) > 0).reduce((s: number, r: any) => s + Number(r.pnl), 0);
      const grossLoss = Math.abs(rows.filter((r: any) => (r.pnl ?? 0) < 0).reduce((s: number, r: any) => s + Number(r.pnl), 0));
      const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
      const wr = rows.length ? (wins / rows.length) * 100 : 0;
      const avgR = rows.length ? rows.reduce((s: number, r: any) => s + (Number(r.rr_realized) || 0), 0) / rows.length : 0;
      return {
        title: `📈 ${preset.charAt(0).toUpperCase() + preset.slice(1)} Performance — ${pnl >= 0 ? "+" : ""}${fmtN(pnl)}`,
        summary: `${rows.length} trades · ${fmtN(wr, 1)}% WR · ${fmtN(pf, 2)} PF · ${fmtN(avgR, 2)}R avg`,
        snapshot: {
          period: preset, trades: rows.length, wins, losses,
          pnl, win_rate: wr, profit_factor: pf === Infinity ? null : pf, avg_r: avgR,
        },
        cover: null, tags: ["performance", preset], symbol: null, market: null, direction: null,
        category: "performance", postType: "chart", linked: {},
      };
    }
    case "ai_review": {
      if (!sourceId) throw new Error("AI review id required");
      const { data: rev } = await supabase.from("ai_trade_reviews").select("*").eq("id", sourceId).eq("user_id", userId).maybeSingle();
      if (!rev) throw new Error("AI review not found or not yours");
      return {
        title: `AI Review: ${rev.symbol ?? ""} · Grade ${rev.grade ?? rev.overall_score ?? "?"}`,
        summary: rev.summary || rev.what_went_well || "",
        snapshot: {
          symbol: rev.symbol, direction: rev.direction, grade: rev.grade,
          overall_score: rev.overall_score,
          entry_quality: rev.entry_score, exit_quality: rev.exit_score,
          risk_score: rev.risk_score, discipline_score: rev.discipline_score,
          key_takeaways: rev.key_takeaways ?? rev.recommendations ?? null,
        },
        cover: null, tags: ["aireview", ...tagsFromSymbol(rev.symbol)],
        symbol: rev.symbol ?? null, market: null, direction: rev.direction ?? null,
        category: "ai-coach", postType: "text",
        linked: { linked_trade_id: rev.trade_id ?? null },
      };
    }
    case "achievement": {
      if (!sourceId) throw new Error("Achievement id required");
      const { data: ua } = await supabase.from("user_achievements").select("*, achievement:achievements(*)").eq("id", sourceId).eq("user_id", userId).maybeSingle();
      if (!ua?.achievement) throw new Error("Achievement not found or not unlocked");
      const a = ua.achievement;
      return {
        title: `🏆 Unlocked: ${a.name}`,
        summary: a.description || "",
        snapshot: {
          achievement_id: a.id, name: a.name, description: a.description,
          xp: a.xp_reward, coins: a.coin_reward, tier: a.tier, rarity: a.rarity,
          unlocked_at: ua.unlocked_at,
        },
        cover: a.image_url ?? null, tags: ["achievement", ...(a.tier ? [a.tier] : [])],
        symbol: null, market: null, direction: null,
        category: "achievement", postType: "text", linked: {},
      };
    }
    case "challenge": {
      if (!sourceId) throw new Error("Challenge id required");
      const { data: uc } = await supabase.from("user_challenges").select("*, challenge:challenges(*)").eq("id", sourceId).eq("user_id", userId).maybeSingle();
      if (!uc?.challenge) throw new Error("Challenge not found");
      const c = uc.challenge;
      return {
        title: `✅ Completed challenge: ${c.name}`,
        summary: c.description || "",
        snapshot: { name: c.name, xp: c.xp_reward, coins: c.coin_reward, completed_at: uc.completed_at },
        cover: c.image_url ?? null, tags: ["challenge"], symbol: null, market: null, direction: null,
        category: "achievement", postType: "text", linked: {},
      };
    }
    case "profile":
    case "custom":
    default: {
      return {
        title: "", summary: "", snapshot: {}, cover: null, tags: [],
        symbol: null, market: null, direction: null,
        category: "", postType: "text", linked: {},
      };
    }
  }
}
