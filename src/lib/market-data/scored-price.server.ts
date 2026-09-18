/**
 * Trusted, server-only price resolution for SCORED / competitive trading
 * (Phase 2 · D-6). The browser never supplies an authoritative price for a
 * scored trade; this module is the only source of truth for scored fills.
 *
 *   - Crypto  → Kraken public Ticker (server-side fetch, timeout, fail closed).
 *               A symbol with no trusted Kraken pair is UNSUPPORTED for scored
 *               trading and must be refused (temporarily disabled), never
 *               settled with a client price.
 *   - FX / metals / indices / stocks / futures → the existing Twelve Data
 *               server proxy (`twelveDataQuote`), which itself never trusts the
 *               client.
 *
 * FAIL CLOSED: if no trusted price is available the caller must abort the
 * scored open/close and surface a temporary-price-unavailable error. There is
 * deliberately no client-price fallback here.
 *
 * NOT for Replay Studio / practice (`chart_closed_trades`): that domain is
 * client/replay-priced by design and must not import this module.
 */

import type { PaperMarket } from "@/lib/paper-trading/symbols";

export type ScoredPriceCode = "temporary-price-unavailable" | "unsupported-scored-symbol";

export class ScoredPriceUnavailableError extends Error {
  readonly code: ScoredPriceCode;
  readonly symbol: string;
  constructor(code: ScoredPriceCode, symbol: string, detail?: string) {
    super(
      code === "unsupported-scored-symbol"
        ? `${symbol} has no trusted server price and is unavailable for scored trading.`
        : `A trusted price for ${symbol} is temporarily unavailable — please retry.${detail ? ` (${detail})` : ""}`,
    );
    this.name = "ScoredPriceUnavailableError";
    this.code = code;
    this.symbol = symbol;
  }
}

export type ScoredPrice = { price: number; source: "kraken" | "twelvedata"; at: number };

/**
 * Scored crypto → Kraken pair. Kraken uses `XBT` for Bitcoin; every other pair
 * is `<base>USDT`. A symbol absent here is unsupported for scored trading.
 * (Verified against api.kraken.com public Ticker: all six resolve.)
 */
const KRAKEN_PAIR: Readonly<Record<string, string>> = {
  "BTC/USDT": "XBTUSDT",
  "ETH/USDT": "ETHUSDT",
  "SOL/USDT": "SOLUSDT",
  "BNB/USDT": "BNBUSDT",
  "XRP/USDT": "XRPUSDT",
  "ADA/USDT": "ADAUSDT",
};

const KRAKEN_TIMEOUT_MS = 8000;

/** True if `symbol` has a trusted scored price source (crypto pair on Kraken). */
export function isScoredCryptoSupported(symbol: string): boolean {
  return symbol in KRAKEN_PAIR;
}

async function krakenLast(symbol: string): Promise<number> {
  const pair = KRAKEN_PAIR[symbol];
  if (!pair) throw new ScoredPriceUnavailableError("unsupported-scored-symbol", symbol);
  let json: any;
  try {
    const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`, {
      signal: AbortSignal.timeout(KRAKEN_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    throw new ScoredPriceUnavailableError("temporary-price-unavailable", symbol, (e as Error).message);
  }
  if (Array.isArray(json?.error) && json.error.length) {
    throw new ScoredPriceUnavailableError("temporary-price-unavailable", symbol, String(json.error[0]));
  }
  const result = json?.result ?? {};
  const key = Object.keys(result)[0];
  const last = key ? Number(result[key]?.c?.[0]) : NaN;
  if (!Number.isFinite(last) || last <= 0) {
    throw new ScoredPriceUnavailableError("temporary-price-unavailable", symbol, "no last price");
  }
  return last;
}

async function twelveDataLast(symbol: string): Promise<number> {
  const { twelveDataQuote } = await import("./twelvedata.functions");
  let last = NaN;
  try {
    const res = await twelveDataQuote({ data: { symbols: [symbol] } });
    last = Number(res?.quotes?.[0]?.last);
  } catch (e) {
    throw new ScoredPriceUnavailableError("temporary-price-unavailable", symbol, (e as Error).message);
  }
  if (!Number.isFinite(last) || last <= 0) {
    throw new ScoredPriceUnavailableError("temporary-price-unavailable", symbol);
  }
  return last;
}

/**
 * The authoritative price for a scored open/close. Throws
 * ScoredPriceUnavailableError (fail closed) when no trusted price exists.
 */
export async function resolveScoredPrice(symbol: string, market: PaperMarket): Promise<ScoredPrice> {
  if (market === "crypto") {
    return { price: await krakenLast(symbol), source: "kraken", at: Date.now() };
  }
  return { price: await twelveDataLast(symbol), source: "twelvedata", at: Date.now() };
}
