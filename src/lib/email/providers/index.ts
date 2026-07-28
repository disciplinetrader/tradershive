/**
 * Provider registry. Add a real transactional provider by:
 *   1. Creating `./resend.ts` (or similar) that implements `EmailProvider`.
 *   2. Adding its export here.
 *   3. Setting `EMAIL_PROVIDER=resend` (+ API key) in the environment.
 *
 * No other file needs to change.
 */
import type { EmailProvider } from "../types";
import { consoleEmailProvider } from "./console";
import { noopEmailProvider } from "./noop";

const REGISTRY: Record<string, EmailProvider> = {
  console: consoleEmailProvider,
  noop: noopEmailProvider,
};

/**
 * Resolve the active provider. Precedence:
 *  1. `EMAIL_PROVIDER` env var (explicit choice).
 *  2. `console` in dev / preview builds.
 *  3. `noop` in production (until a real provider is wired in).
 */
export function resolveEmailProvider(): EmailProvider {
  const explicit = (process.env.EMAIL_PROVIDER ?? "").toLowerCase().trim();
  if (explicit && REGISTRY[explicit]) return REGISTRY[explicit];
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? noopEmailProvider : consoleEmailProvider;
}

export function listRegisteredProviders(): string[] {
  return Object.keys(REGISTRY);
}
