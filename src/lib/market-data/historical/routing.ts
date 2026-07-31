/**
 * Canonical historical-provider routing.
 *
 * ONE table decides which provider serves historical candles for a market.
 * Replay, Coverage Probe, Historical Import, Creator Wizard, Surprise
 * Session, Practice Attempts, Admin Import and on-demand Backfill all call
 * `resolveHistoricalProvider()` — no module picks a provider on its own.
 *
 * Stooq is NEVER a default. It is only usable when a caller explicitly asks
 * for it AND `ENABLE_STOOQ_HISTORICAL=true` is set on the server.
 */

export type HistoricalMarket =
  | "crypto" | "forex" | "metals" | "indices" | "commodities" | "stocks";

/** market → canonical historical provider code. */
export const HISTORICAL_PROVIDER_ROUTING: Record<HistoricalMarket, string> = {
  crypto: "binance",
  forex: "twelvedata",
  metals: "twelvedata",
  indices: "twelvedata",
  commodities: "twelvedata",
  stocks: "twelvedata",
};

/** Anything not in the table falls back to the broadest provider we have. */
export const DEFAULT_HISTORICAL_PROVIDER = "twelvedata";

/** Provider codes that must never be selected implicitly. */
export const OPTIONAL_PROVIDERS = new Set(["stooq", "dukascopy"]);

export function stooqEnabled(): boolean {
  return String(process.env.ENABLE_STOOQ_HISTORICAL ?? "").toLowerCase() === "true";
}

export type ProviderResolution = {
  /** Provider code that MUST be used for this import/read. */
  code: string;
  /** Canonical routing choice for the market, before any override. */
  canonical: string;
  /** True when a stored/requested code was rejected and replaced. */
  overrode: boolean;
  /** Human-readable reason, logged with every import job. */
  reason: string;
};

export function canonicalProviderForMarket(market?: string | null): string {
  const m = String(market ?? "").toLowerCase() as HistoricalMarket;
  return HISTORICAL_PROVIDER_ROUTING[m] ?? DEFAULT_HISTORICAL_PROVIDER;
}

/**
 * Resolve the provider for a symbol.
 *
 * @param market    market kind stored on `historical_symbols`
 * @param requested provider code stored on the row / asked for by the caller
 */
export function resolveHistoricalProvider(
  market?: string | null,
  requested?: string | null,
): ProviderResolution {
  const canonical = canonicalProviderForMarket(market);
  const req = String(requested ?? "").toLowerCase().trim();

  if (!req) {
    return { code: canonical, canonical, overrode: false, reason: `routed by market (${market ?? "unknown"})` };
  }

  if (OPTIONAL_PROVIDERS.has(req)) {
    if (stooqEnabled()) {
      return {
        code: "stooq", canonical, overrode: false,
        reason: "stooq explicitly requested and ENABLE_STOOQ_HISTORICAL=true",
      };
    }
    return {
      code: canonical, canonical, overrode: true,
      reason: `stooq is disabled (ENABLE_STOOQ_HISTORICAL not set); routed ${market ?? "unknown"} → ${canonical}`,
    };
  }

  if (req !== canonical) {
    return {
      code: canonical, canonical, overrode: true,
      reason: `"${req}" is not the canonical provider for ${market ?? "unknown"}; routed → ${canonical}`,
    };
  }

  return { code: canonical, canonical, overrode: false, reason: `canonical provider for ${market ?? "unknown"}` };
}

/* ------------------------- native symbol mapping ------------------------- */

/** Canonical symbol → Twelve Data ticker for non-pair instruments. */
const TWELVEDATA_SYMBOL_MAP: Record<string, string> = {
  SPX500: "SPX",
  NAS100: "IXIC",
  US30: "DJI",
  GER40: "DAX",
  UK100: "UKX",
  JP225: "N225",
  "WTI/USD": "WTI/USD",
  "BRENT/USD": "BRENT/USD",
};

/**
 * Native ticker for a provider. When the stored `native_symbol` belongs to a
 * different provider (e.g. Stooq's lowercase `eurusd`) it is ignored and the
 * ticker is derived from the canonical symbol instead.
 */
export function nativeSymbolForProvider(
  providerCode: string,
  canonicalSymbol: string,
  storedNative?: string | null,
  storedProvider?: string | null,
): string {
  const sameProvider =
    !!storedProvider && storedProvider.toLowerCase() === providerCode.toLowerCase();
  if (sameProvider && storedNative) return storedNative;

  const sym = canonicalSymbol.toUpperCase();
  switch (providerCode) {
    case "binance":
      return sym.replace(/[^A-Z0-9]/g, "");
    case "twelvedata": {
      if (TWELVEDATA_SYMBOL_MAP[sym]) return TWELVEDATA_SYMBOL_MAP[sym];
      if (sym.includes("/")) return sym;
      // 6-letter FX / metal pairs stored without a slash → EURUSD → EUR/USD
      if (/^[A-Z]{6}$/.test(sym)) return `${sym.slice(0, 3)}/${sym.slice(3)}`;
      return sym;
    }
    default:
      return storedNative ?? sym;
  }
}
