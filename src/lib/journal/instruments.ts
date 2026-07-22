/**
 * Journal V2 — Instrument catalog for smart search + price validation.
 *
 * Sourced from the paper-trading `SYMBOL_CATALOG` so the journal shares one
 * source of truth for tick size, decimals, and market classification. On top
 * of that we add fuzzy aliases (common names, broker prefixes) and per-user
 * recency/frequency scoring persisted in localStorage.
 */

import { SYMBOL_CATALOG, type PaperMarket, type SymbolMeta } from "@/lib/paper-trading/symbols";

export type JournalMarket = PaperMarket;

export type InstrumentRecord = SymbolMeta & {
  /** Canonical + common aliases (no separators, uppercased). */
  aliases: string[];
  /** Human-friendly aliases surfaced in the UI (e.g. "Gold", "Nasdaq"). */
  commonNames: string[];
};

/* -------------------------------------------------------------------------- */
/*  Alias tables                                                              */
/* -------------------------------------------------------------------------- */

const ALIAS_MAP: Record<string, { aliases: string[]; commonNames: string[] }> = {
  // Forex
  "EUR/USD": { aliases: ["EURUSD", "FX:EURUSD", "OANDA:EURUSD"], commonNames: ["Euro Dollar", "Fiber"] },
  "GBP/USD": { aliases: ["GBPUSD"], commonNames: ["Cable", "Pound Dollar"] },
  "USD/JPY": { aliases: ["USDJPY"], commonNames: ["Ninja", "Yen"] },
  "AUD/USD": { aliases: ["AUDUSD"], commonNames: ["Aussie", "Aussie Dollar"] },
  "USD/CAD": { aliases: ["USDCAD"], commonNames: ["Loonie"] },
  "USD/CHF": { aliases: ["USDCHF"], commonNames: ["Swissy"] },
  "NZD/USD": { aliases: ["NZDUSD"], commonNames: ["Kiwi"] },
  "EUR/GBP": { aliases: ["EURGBP"], commonNames: ["Chunnel"] },
  "GBP/JPY": { aliases: ["GBPJPY"], commonNames: ["Beast", "Dragon"] },
  "EUR/JPY": { aliases: ["EURJPY"], commonNames: ["Yuppie"] },
  // Metals
  "XAU/USD": { aliases: ["XAUUSD", "GOLD"], commonNames: ["Gold"] },
  "XAG/USD": { aliases: ["XAGUSD", "SILVER"], commonNames: ["Silver"] },
  // Indices
  "SPX500": { aliases: ["SPX", "SP500", "US500", "ES1!"], commonNames: ["S&P 500", "SPY"] },
  "NAS100": { aliases: ["NDX", "US100", "NQ", "NQ1!"], commonNames: ["Nasdaq", "Nasdaq 100"] },
  "US30":   { aliases: ["DJI", "DOW", "YM", "YM1!"], commonNames: ["Dow", "Dow Jones"] },
  "GER40":  { aliases: ["DE40", "DAX"], commonNames: ["DAX", "DAX 40"] },
  "UK100":  { aliases: ["FTSE", "FTSE100"], commonNames: ["FTSE", "Footsie"] },
  "JP225":  { aliases: ["N225", "NKY"], commonNames: ["Nikkei", "Nikkei 225"] },
  // Crypto
  "BTC/USDT": { aliases: ["BTCUSDT", "BTCUSD", "XBTUSD"], commonNames: ["Bitcoin"] },
  "ETH/USDT": { aliases: ["ETHUSDT", "ETHUSD"], commonNames: ["Ethereum", "Ether"] },
  "SOL/USDT": { aliases: ["SOLUSDT", "SOLUSD"], commonNames: ["Solana"] },
  "BNB/USDT": { aliases: ["BNBUSDT"], commonNames: ["BNB", "Binance Coin"] },
  "XRP/USDT": { aliases: ["XRPUSDT", "XRPUSD"], commonNames: ["Ripple", "XRP"] },
  "ADA/USDT": { aliases: ["ADAUSDT"], commonNames: ["Cardano"] },
  // Futures
  "ES": { aliases: ["ES1!", "/ES"], commonNames: ["E-mini S&P"] },
  "NQ": { aliases: ["NQ1!", "/NQ"], commonNames: ["E-mini Nasdaq"] },
  "CL": { aliases: ["CL1!", "/CL", "WTI"], commonNames: ["Crude Oil", "WTI"] },
  "GC": { aliases: ["GC1!", "/GC"], commonNames: ["Gold Futures"] },
};

export const INSTRUMENTS: InstrumentRecord[] = SYMBOL_CATALOG.map((s) => {
  const extra = ALIAS_MAP[s.symbol] ?? { aliases: [], commonNames: [] };
  return {
    ...s,
    aliases: extra.aliases,
    commonNames: extra.commonNames,
  };
});

const INSTRUMENT_BY_KEY = new Map<string, InstrumentRecord>();
for (const inst of INSTRUMENTS) {
  INSTRUMENT_BY_KEY.set(normalizeKey(inst.symbol), inst);
  for (const alias of inst.aliases) INSTRUMENT_BY_KEY.set(normalizeKey(alias), inst);
}

function normalizeKey(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/* -------------------------------------------------------------------------- */
/*  Recency / frequency scoring                                               */
/* -------------------------------------------------------------------------- */

const RECENCY_KEY = "th_journal_instrument_recency_v1";
type RecencyState = Record<string, { count: number; lastUsedAt: number }>;

function loadRecency(): RecencyState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(RECENCY_KEY) || "{}") as RecencyState;
  } catch {
    return {};
  }
}

function saveRecency(state: RecencyState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENCY_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

/** Record a "user picked this symbol" event for future ranking. */
export function markInstrumentUsed(symbol: string) {
  const inst = findInstrument(symbol);
  if (!inst) return;
  const state = loadRecency();
  const prev = state[inst.symbol] ?? { count: 0, lastUsedAt: 0 };
  state[inst.symbol] = { count: prev.count + 1, lastUsedAt: Date.now() };
  saveRecency(state);
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                    */
/* -------------------------------------------------------------------------- */

export type InstrumentMatch = {
  instrument: InstrumentRecord;
  /** Match score, higher is better. */
  score: number;
  /** Character indexes highlighted in the display label. */
  highlight: [number, number][];
  /** Which field the primary match came from. */
  matchedField: "symbol" | "alias" | "name" | "common" | "prefix";
};

/**
 * Fuzzy instrument search.
 * Recency + frequency boost promoted matches; exact prefix hits always win.
 */
export function searchInstruments(
  query: string,
  opts: { limit?: number; market?: JournalMarket | null } = {},
): InstrumentMatch[] {
  const limit = opts.limit ?? 12;
  const q = query.trim();
  const recency = loadRecency();
  const now = Date.now();

  const rows = INSTRUMENTS.filter((i) => (opts.market ? i.market === opts.market : true));

  if (!q) {
    // No query — surface recents + majors first.
    return rows
      .map((instrument) => ({
        instrument,
        score: recencyBoost(recency, instrument.symbol, now) + popularityBoost(instrument),
        highlight: [] as [number, number][],
        matchedField: "symbol" as const,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  const nq = normalizeKey(q);
  const lower = q.toLowerCase();
  const matches: InstrumentMatch[] = [];

  for (const instrument of rows) {
    const normSymbol = normalizeKey(instrument.symbol);
    let score = 0;
    let matchedField: InstrumentMatch["matchedField"] = "symbol";
    let highlightSource: string | null = null;

    if (normSymbol === nq) {
      score = 1000;
      matchedField = "symbol";
      highlightSource = instrument.symbol;
    } else if (normSymbol.startsWith(nq)) {
      score = 800 - (normSymbol.length - nq.length);
      matchedField = "prefix";
      highlightSource = instrument.symbol;
    } else if (normSymbol.includes(nq)) {
      score = 500 - (normSymbol.length - nq.length);
      matchedField = "symbol";
      highlightSource = instrument.symbol;
    }

    for (const alias of instrument.aliases) {
      const na = normalizeKey(alias);
      if (na === nq) { score = Math.max(score, 900); matchedField = "alias"; highlightSource ??= instrument.symbol; }
      else if (na.startsWith(nq)) { score = Math.max(score, 700 - (na.length - nq.length)); matchedField = "alias"; highlightSource ??= instrument.symbol; }
      else if (na.includes(nq)) { score = Math.max(score, 400 - (na.length - nq.length)); matchedField = "alias"; highlightSource ??= instrument.symbol; }
    }

    const nameLower = instrument.name.toLowerCase();
    if (nameLower.includes(lower)) {
      score = Math.max(score, 300);
      matchedField = matchedField === "symbol" && score < 500 ? "name" : matchedField;
    }

    for (const cn of instrument.commonNames) {
      const cnLower = cn.toLowerCase();
      if (cnLower === lower) { score = Math.max(score, 850); matchedField = "common"; }
      else if (cnLower.startsWith(lower)) { score = Math.max(score, 620); matchedField = "common"; }
      else if (cnLower.includes(lower)) { score = Math.max(score, 350); matchedField = matchedField === "symbol" ? "common" : matchedField; }
    }

    if (score <= 0) continue;

    score += recencyBoost(recency, instrument.symbol, now);
    score += popularityBoost(instrument);

    const label = highlightSource ?? instrument.symbol;
    matches.push({
      instrument,
      score,
      highlight: highlightsFor(label, q),
      matchedField,
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

function recencyBoost(recency: RecencyState, symbol: string, now: number): number {
  const r = recency[symbol];
  if (!r) return 0;
  const daysSince = Math.max(0, (now - r.lastUsedAt) / 86_400_000);
  const freshness = Math.max(0, 1 - daysSince / 30); // decays over ~30 days
  return r.count * 3 + freshness * 40;
}

const POPULAR = new Set([
  "EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD",
  "BTC/USDT", "ETH/USDT",
  "NAS100", "SPX500", "US30",
]);
function popularityBoost(instrument: InstrumentRecord): number {
  return POPULAR.has(instrument.symbol) ? 15 : 0;
}

function highlightsFor(label: string, q: string): [number, number][] {
  if (!q) return [];
  const lower = label.toLowerCase();
  const nq = q.toLowerCase();
  const idx = lower.indexOf(nq);
  if (idx >= 0) return [[idx, idx + nq.length]];
  // fall back to normalized-string match
  const norm = normalizeKey(label);
  const nk = normalizeKey(q);
  const j = norm.indexOf(nk);
  if (j < 0) return [];
  // map normalized index back to raw string
  let raw = 0;
  let projected = 0;
  const map: number[] = [];
  for (const ch of label) {
    if (/[A-Za-z0-9]/.test(ch)) map[projected++] = raw;
    raw++;
  }
  const start = map[j] ?? 0;
  const end = (map[j + nk.length - 1] ?? start) + 1;
  return [[start, end]];
}

/* -------------------------------------------------------------------------- */
/*  Lookup + validation                                                       */
/* -------------------------------------------------------------------------- */

export function findInstrument(symbol: string | null | undefined): InstrumentRecord | null {
  if (!symbol) return null;
  return INSTRUMENT_BY_KEY.get(normalizeKey(symbol)) ?? null;
}

/** Validate a user-entered price against the instrument's precision. */
export function validatePrice(
  raw: string | number | null | undefined,
  instrument: InstrumentRecord | null,
): { valid: boolean; value: number | null; error: string | null } {
  if (raw === "" || raw == null) return { valid: true, value: null, error: null };
  const str = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    return { valid: false, value: null, error: "Enter a number like 1.08452" };
  }
  const value = Number(str);
  if (!Number.isFinite(value) || value <= 0) {
    return { valid: false, value: null, error: "Price must be greater than zero" };
  }
  if (!instrument) return { valid: true, value, error: null };
  const decimals = instrument.decimals;
  const [, frac = ""] = str.split(".");
  if (frac.length > decimals) {
    return {
      valid: false,
      value: null,
      error: `Max ${decimals} decimals for ${instrument.symbol}`,
    };
  }
  // Sanity range check — reject e.g. 10845 for EURUSD
  const ref = instrument.refPrice;
  if (ref > 0) {
    const ratio = value / ref;
    if (ratio > 25 || ratio < 0.04) {
      return {
        valid: false,
        value: null,
        error: `Out of expected range for ${instrument.symbol}`,
      };
    }
  }
  return { valid: true, value, error: null };
}

/** Format a price using the instrument's decimals. */
export function formatPrice(value: number | null | undefined, instrument: InstrumentRecord | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  const d = instrument?.decimals ?? 2;
  return value.toFixed(d);
}
