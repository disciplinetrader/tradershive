import type { MarketKind } from "./types";

export type ProviderUnavailableReason =
  | "not_assigned"
  | "not_configured"
  | "disabled"
  | "provider_error"
  | "unauthorized"
  | "rate_limited"
  | "network"
  | "unknown";

export class MarketProviderUnavailableError extends Error {
  readonly market?: MarketKind;
  readonly reason: ProviderUnavailableReason;
  readonly providerCode?: string;
  constructor(opts: { market?: MarketKind; reason: ProviderUnavailableReason; providerCode?: string; message?: string }) {
    super(opts.message ?? defaultMessage(opts.market, opts.reason, opts.providerCode));
    this.name = "MarketProviderUnavailableError";
    this.market = opts.market;
    this.reason = opts.reason;
    this.providerCode = opts.providerCode;
  }
}

function marketLabel(m?: MarketKind) {
  if (!m) return "This market";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function defaultMessage(m: MarketKind | undefined, r: ProviderUnavailableReason, code?: string) {
  const who = marketLabel(m);
  switch (r) {
    case "not_assigned":  return `${who} provider not configured. Assign one in Admin → Market Data.`;
    case "not_configured": return `${who} provider${code ? ` (${code})` : ""} needs credentials. Set them in Admin → Market Data.`;
    case "disabled":       return `${who} provider${code ? ` (${code})` : ""} is disabled.`;
    case "unauthorized":   return `${who} provider${code ? ` (${code})` : ""} rejected the credentials.`;
    case "rate_limited":   return `${who} provider${code ? ` (${code})` : ""} rate limit exceeded.`;
    case "network":        return `${who} provider${code ? ` (${code})` : ""} is unreachable.`;
    default:               return `${who} provider${code ? ` (${code})` : ""} is unavailable.`;
  }
}
