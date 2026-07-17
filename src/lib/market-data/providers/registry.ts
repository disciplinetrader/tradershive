import type { MarketDataProvider } from "../types";
import { MockMarketDataProvider } from "./mock";
import { BinanceProvider } from "./binance";
import { TwelveDataProvider } from "./twelvedata";

// Client-side registry — dependency-injected in the engine.
const registry = new Map<string, MarketDataProvider>();

export function registerProvider(p: MarketDataProvider) { registry.set(p.code, p); }
export function getProvider(code: string): MarketDataProvider | undefined { return registry.get(code); }
export function listProviders(): MarketDataProvider[] { return [...registry.values()]; }

let bootstrapped = false;
export function bootstrapProviders() {
  if (bootstrapped) return;
  bootstrapped = true;
  // Mock is registered so admin tooling can still inspect it, but the engine
  // never routes to it automatically — real providers are the only defaults.
  registerProvider(new MockMarketDataProvider());
  registerProvider(new BinanceProvider());   // Crypto — public REST + WS, no key.
  registerProvider(new TwelveDataProvider()); // Forex / Metals / Indices — TWELVE_DATA_API_KEY.
}
