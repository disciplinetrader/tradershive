import type { MarketDataProvider } from "../types";
import { PROVIDER_DESCRIPTORS } from "../descriptors";
import { MockMarketDataProvider } from "./mock";
import { BinanceProvider } from "./binance";
import { TwelveDataProvider } from "./twelvedata";
import { FinnhubProvider } from "./finnhub";
import { PlaceholderProvider } from "./placeholder";

// Client-side registry — dependency-injected in the engine.
const registry = new Map<string, MarketDataProvider>();

export function registerProvider(p: MarketDataProvider) { registry.set(p.code, p); }
export function getProvider(code: string): MarketDataProvider | undefined { return registry.get(code); }
export function listProviders(): MarketDataProvider[] { return [...registry.values()]; }

let bootstrapped = false;
export function bootstrapProviders() {
  if (bootstrapped) return;
  bootstrapped = true;
  // Mock is registered so admin tooling can still inspect it; the engine
  // never routes to it automatically.
  registerProvider(new MockMarketDataProvider());
  registerProvider(new BinanceProvider());
  registerProvider(new TwelveDataProvider());
  registerProvider(new FinnhubProvider());
  // Every other descriptor gets a placeholder so it shows up in the Admin
  // Panel with a configuration form and health tile. Real adapters can be
  // dropped in by replacing the registration below.
  for (const d of PROVIDER_DESCRIPTORS) {
    if (registry.has(d.code)) continue;
    registerProvider(new PlaceholderProvider(d.code));
  }
}
