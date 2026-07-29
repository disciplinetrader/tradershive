/**
 * Dashboard Mode — architectural preparation for future dashboard variants.
 *
 * Three modes are defined; UI-specific rendering is NOT implemented yet.
 * The Hero already adapts via `HeroState`; this helper standardises the
 * mode label so future surfaces (empty-state banners, onboarding hints,
 * telemetry) share one source of truth.
 */

import type { HeroState } from "./dashboard-hero.functions";

export type DashboardMode = "new_user" | "active_trader" | "returning_trader";

const RETURNING_STALE_HOURS = 48;

export function resolveDashboardMode(state: HeroState | undefined | null): DashboardMode {
  if (!state) return "new_user";

  // Active: traded today OR has an active prop challenge in progress.
  if (state.tradesToday > 0 || state.activeChallenges.length > 0) {
    return "active_trader";
  }

  // Returning: has history but hasn't traded today.
  if (state.paperTradeCount > 0 || state.replayCount > 0) {
    const last = state.lastTradeAt ? new Date(state.lastTradeAt).getTime() : 0;
    const hours = last ? (Date.now() - last) / 3_600_000 : Infinity;
    if (hours >= RETURNING_STALE_HOURS || state.tradesToday === 0) {
      return "returning_trader";
    }
    return "active_trader";
  }

  return "new_user";
}
