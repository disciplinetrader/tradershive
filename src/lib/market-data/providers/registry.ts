import type { MarketDataProvider } from "../types";
import { MockMarketDataProvider } from "./mock";
import { BinanceProvider } from "./binance";
import { OandaProvider } from "./oanda";

// Client-side registry — dependency-injected in the engine.
const registry = new Map<string, MarketDataProvider>();

export function registerProvider(p: MarketDataProvider) { registry.set(p.code, p); }
export function getProvider(code: string): MarketDataProvider | undefined { return registry.get(code); }
export function listProviders(): MarketDataProvider[] { return [...registry.values()]; }

let bootstrapped = false;
export function bootstrapProviders() {
  if (bootstrapped) return;
  bootstrapped = true;
  registerProvider(new MockMarketDataProvider());
  registerProvider(new BinanceProvider());
  registerProvider(new OandaProvider());
}
