/**
 * REPLAY STUDIO X — design tokens exposed to TypeScript (Phase 0).
 *
 * Mirrors the CSS custom properties in `src/styles/replay-studio.css`.
 * Only values that layout code needs to reason about numerically
 * (heights, clamps, motion) live here — colors stay in CSS.
 */

export const RX = {
  toolbarH: 38,
  timelineH: 34,
  dockCollapsedH: 32,
  dockDefaultH: 248,
  dockMinH: 140,
  dockMaxH: 520,
  railW: 38,
  durFast: 90,
  dur: 150,
  durSlow: 240,
} as const;

export type RxSize = "sm" | "md" | "lg";
