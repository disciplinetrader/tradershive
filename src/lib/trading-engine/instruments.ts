/**
 * Instrument Registry — Phase 2.
 *
 * Every tradable symbol carries a complete, self-describing specification.
 * The Trading Engine, sizing helpers, tick engine, and validation layers
 * read from this registry and never hardcode asset-specific values.
 *
 * The registry is seeded from the existing `SYMBOL_CATALOG` so we stay
 * compatible with paper-trading UI, charts, and the Market Data layer
 * (Yahoo Finance) without any migration. New instruments only need to be
 * registered here — no engine changes required.
 */

import { SYMBOL_CATALOG, type PaperMarket, type SymbolMeta } from "@/lib/paper-trading/symbols";

export type AssetClass = "forex" | "metals" | "indices" | "crypto" | "stocks" | "futures" | "options";

export type LotType = "standard" | "mini" | "micro" | "unit" | "share" | "contract";

export type MarginClass = "tier1_forex" | "minor_forex" | "exotic_forex" | "metals" | "indices" | "crypto" | "stocks" | "futures" | "options";

export type InstrumentStatus = "active" | "paused" | "delisted" | "coming_soon";

export type SessionId =
  | "sydney" | "tokyo" | "london" | "new_york"
  | "us_equities" | "eu_equities" | "asia_equities"
  | "cme_globex" | "ice" | "lme"
  | "crypto_247";

export type InstrumentSpec = {
  /** Canonical symbol used everywhere in the engine. */
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  baseCurrency: string;
  quoteCurrency: string;

  /** Units per 1.00 lot. */
  contractSize: number;
  minQuantity: number;
  maxQuantity: number;
  quantityStep: number;
  supportsFractional: boolean;

  /** Smallest price increment (e.g. 0.00001 for EURUSD 5-digit). */
  minTickSize: number;
  /** Cash value of one tick per 1.00 lot in the quote currency. */
  tickValue: number;
  pricePrecision: number;
  quantityPrecision: number;

  /** Pip = display-friendly move (1 pip = 10 ticks for 5-digit FX). */
  pipSize: number;
  pipValuePerLot: number;

  marginClass: MarginClass;
  sessions: SessionId[];

  swapEligible: boolean;
  supportsLeverage: boolean;
  supportsShort: boolean;

  lotType: LotType;
  /** Minimum stop/limit distance from market in ticks. */
  minStopDistanceTicks: number;

  expiry?: string | null;
  exchange: string;
  status: InstrumentStatus;
};

// ---------- Asset-class → sensible defaults ----------

type SpecDefaults = Partial<InstrumentSpec>;

const CLASS_DEFAULTS: Record<AssetClass, SpecDefaults> = {
  forex: {
    contractSize: 100_000, lotType: "standard", supportsFractional: true,
    minTickSize: 0.00001, tickValue: 1, pricePrecision: 5, quantityPrecision: 2,
    swapEligible: true, supportsLeverage: true, supportsShort: true,
    marginClass: "tier1_forex", exchange: "OTC", sessions: ["sydney","tokyo","london","new_york"],
    minStopDistanceTicks: 10,
  },
  metals: {
    contractSize: 100, lotType: "standard", supportsFractional: true,
    minTickSize: 0.01, tickValue: 1, pricePrecision: 2, quantityPrecision: 2,
    swapEligible: true, supportsLeverage: true, supportsShort: true,
    marginClass: "metals", exchange: "OTC", sessions: ["london","new_york"],
    minStopDistanceTicks: 20,
  },
  indices: {
    contractSize: 10, lotType: "contract", supportsFractional: true,
    minTickSize: 0.1, tickValue: 1, pricePrecision: 1, quantityPrecision: 1,
    swapEligible: true, supportsLeverage: true, supportsShort: true,
    marginClass: "indices", exchange: "CFD",
    sessions: ["us_equities"], minStopDistanceTicks: 5,
  },
  crypto: {
    contractSize: 1, lotType: "unit", supportsFractional: true,
    minTickSize: 0.01, tickValue: 0.01, pricePrecision: 2, quantityPrecision: 4,
    swapEligible: false, supportsLeverage: true, supportsShort: true,
    marginClass: "crypto", exchange: "Crypto",
    sessions: ["crypto_247"], minStopDistanceTicks: 5,
  },
  stocks: {
    contractSize: 1, lotType: "share", supportsFractional: false,
    minTickSize: 0.01, tickValue: 0.01, pricePrecision: 2, quantityPrecision: 0,
    swapEligible: false, supportsLeverage: true, supportsShort: true,
    marginClass: "stocks", exchange: "NASDAQ",
    sessions: ["us_equities"], minStopDistanceTicks: 1,
  },
  futures: {
    contractSize: 1, lotType: "contract", supportsFractional: false,
    minTickSize: 0.25, tickValue: 12.5, pricePrecision: 2, quantityPrecision: 0,
    swapEligible: false, supportsLeverage: true, supportsShort: true,
    marginClass: "futures", exchange: "CME",
    sessions: ["cme_globex"], minStopDistanceTicks: 1,
  },
  options: {
    contractSize: 100, lotType: "contract", supportsFractional: false,
    minTickSize: 0.01, tickValue: 1, pricePrecision: 2, quantityPrecision: 0,
    swapEligible: false, supportsLeverage: false, supportsShort: true,
    marginClass: "options", exchange: "OCC",
    sessions: ["us_equities"], minStopDistanceTicks: 1,
  },
};

// ---------- Symbol → asset class + margin class overrides ----------

const MINOR_FX = new Set(["EUR/GBP", "EUR/JPY", "GBP/JPY", "AUD/NZD", "AUD/CAD"]);

function assetClassFromMarket(m: PaperMarket): AssetClass {
  return m === "metals" ? "metals" : (m as AssetClass);
}

function currenciesFor(sym: string, cls: AssetClass): { base: string; quote: string } {
  if (cls === "forex" || cls === "crypto" || cls === "metals") {
    const [b, q] = sym.includes("/") ? sym.split("/") : [sym.slice(0, 3), sym.slice(3)];
    return { base: b, quote: q };
  }
  if (cls === "indices" || cls === "futures" || cls === "stocks" || cls === "options") {
    return { base: sym, quote: "USD" };
  }
  return { base: sym, quote: "USD" };
}

function exchangeFor(cls: AssetClass, symbol: string): string {
  if (cls === "stocks") return "NASDAQ";
  if (cls === "futures") {
    if (symbol === "CL" || symbol === "GC") return "NYMEX";
    return "CME";
  }
  if (cls === "crypto") return "Binance";
  if (cls === "indices") return "CFD";
  if (cls === "metals") return "OTC";
  return "OTC";
}

function marginClassFor(cls: AssetClass, symbol: string): MarginClass {
  if (cls === "forex") return MINOR_FX.has(symbol) ? "minor_forex" : "tier1_forex";
  if (cls === "metals") return "metals";
  if (cls === "indices") return "indices";
  if (cls === "crypto") return "crypto";
  if (cls === "stocks") return "stocks";
  if (cls === "futures") return "futures";
  return "options";
}

function specFromLegacy(meta: SymbolMeta): InstrumentSpec {
  const cls = assetClassFromMarket(meta.market);
  const defaults = CLASS_DEFAULTS[cls];
  const { base, quote } = currenciesFor(meta.symbol, cls);
  // Tick == smallest quoted increment == 10^-decimals; pip == meta.pipSize.
  const minTickSize = Math.pow(10, -meta.decimals);
  const tickValue = (meta.pipValuePerLot * minTickSize) / meta.pipSize;
  return {
    symbol: meta.symbol,
    displayName: meta.name,
    assetClass: cls,
    baseCurrency: base,
    quoteCurrency: quote,
    contractSize: meta.contractSize,
    minQuantity: meta.minLot,
    maxQuantity: meta.maxLot,
    quantityStep: meta.lotStep,
    supportsFractional: (defaults.supportsFractional ?? true) && meta.lotStep < 1,
    minTickSize,
    tickValue,
    pricePrecision: meta.decimals,
    quantityPrecision: Math.max(0, Math.round(-Math.log10(meta.lotStep))),
    pipSize: meta.pipSize,
    pipValuePerLot: meta.pipValuePerLot,
    marginClass: marginClassFor(cls, meta.symbol),
    sessions: defaults.sessions ?? ["new_york"],
    swapEligible: defaults.swapEligible ?? true,
    supportsLeverage: defaults.supportsLeverage ?? true,
    supportsShort: defaults.supportsShort ?? true,
    lotType: defaults.lotType ?? "standard",
    minStopDistanceTicks: defaults.minStopDistanceTicks ?? 5,
    expiry: null,
    exchange: exchangeFor(cls, meta.symbol),
    status: "active",
  };
}

// ---------- Registry ----------

const REGISTRY = new Map<string, InstrumentSpec>();

/** Seed registry from the existing symbol catalog so all UI works today. */
for (const meta of SYMBOL_CATALOG) {
  REGISTRY.set(meta.symbol, specFromLegacy(meta));
}

/** Register or override an instrument at runtime (admin panel, tests, plugins). */
export function registerInstrument(spec: InstrumentSpec): void {
  REGISTRY.set(spec.symbol, spec);
}

/** Register from partial data + asset-class defaults. */
export function registerInstrumentPartial(
  partial: Pick<InstrumentSpec, "symbol" | "displayName" | "assetClass"> & Partial<InstrumentSpec>,
): InstrumentSpec {
  const defaults = CLASS_DEFAULTS[partial.assetClass];
  const { base, quote } = currenciesFor(partial.symbol, partial.assetClass);
  const spec: InstrumentSpec = {
    baseCurrency: base,
    quoteCurrency: quote,
    contractSize: defaults.contractSize ?? 1,
    minQuantity: defaults.contractSize ? 0.01 : 1,
    maxQuantity: 1_000,
    quantityStep: defaults.supportsFractional ? 0.01 : 1,
    supportsFractional: defaults.supportsFractional ?? false,
    minTickSize: defaults.minTickSize ?? 0.01,
    tickValue: defaults.tickValue ?? 1,
    pricePrecision: defaults.pricePrecision ?? 2,
    quantityPrecision: defaults.quantityPrecision ?? 2,
    pipSize: defaults.minTickSize ?? 0.01,
    pipValuePerLot: defaults.tickValue ?? 1,
    marginClass: marginClassFor(partial.assetClass, partial.symbol),
    sessions: defaults.sessions ?? ["new_york"],
    swapEligible: defaults.swapEligible ?? false,
    supportsLeverage: defaults.supportsLeverage ?? true,
    supportsShort: defaults.supportsShort ?? true,
    lotType: defaults.lotType ?? "contract",
    minStopDistanceTicks: defaults.minStopDistanceTicks ?? 1,
    expiry: null,
    exchange: exchangeFor(partial.assetClass, partial.symbol),
    status: "active",
    ...partial,
  };
  REGISTRY.set(spec.symbol, spec);
  return spec;
}

export function getInstrument(symbol: string): InstrumentSpec | undefined {
  return REGISTRY.get(symbol);
}

export function requireInstrument(symbol: string): InstrumentSpec {
  const spec = REGISTRY.get(symbol);
  if (!spec) throw new Error(`Unknown instrument: ${symbol}`);
  return spec;
}

export function listInstruments(filter?: { assetClass?: AssetClass; status?: InstrumentStatus }): InstrumentSpec[] {
  const out: InstrumentSpec[] = [];
  for (const spec of REGISTRY.values()) {
    if (filter?.assetClass && spec.assetClass !== filter.assetClass) continue;
    if (filter?.status && spec.status !== filter.status) continue;
    out.push(spec);
  }
  return out;
}

export { CLASS_DEFAULTS };
