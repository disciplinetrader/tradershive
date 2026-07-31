/**
 * Phase 7 analytics domain — public surface.
 *
 * Import from `@/lib/analytics` only. Reaching into individual modules from
 * UI code is what lets duplicate formulas creep back in.
 */

export * from "./model";
export * from "./periods";
export * from "./filters";
export * from "./normalize";
export * from "./expectancy";
export * from "./equity";
export * from "./drawdown";
export * from "./execution-quality";
export * from "./behaviour";
export * from "./cohorts";
export * from "./engine";
export * from "./cache";
export * from "./selectors";
