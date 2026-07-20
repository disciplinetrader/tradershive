import { useEffect, useState } from "react";
import { useTheme } from "@/hooks/use-theme";

const TOKENS = [
  "--primary",
  "--primary-glow",
  "--danger",
  "--success",
  "--warning",
  "--info",
  "--muted-foreground",
  "--foreground",
  "--border",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

export type ThemeColorToken = (typeof TOKENS)[number];
export type ThemeColors = Record<ThemeColorToken, string>;

function read(): ThemeColors {
  if (typeof window === "undefined") {
    return TOKENS.reduce((acc, k) => ({ ...acc, [k]: "#94a3b8" }), {} as ThemeColors);
  }
  const cs = getComputedStyle(document.documentElement);
  return TOKENS.reduce((acc, k) => {
    const v = cs.getPropertyValue(k).trim();
    acc[k] = v || "#94a3b8";
    return acc;
  }, {} as ThemeColors);
}

/**
 * Resolves CSS custom color tokens to real color strings so they can be
 * used inside SVG `fill`/`stroke` attributes (Recharts, custom SVGs) which
 * do NOT resolve `var(...)` references.
 */
export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<ThemeColors>(() => read());
  useEffect(() => {
    // Read on next frame so the .dark class has already been applied.
    const raf = requestAnimationFrame(() => setColors(read()));
    return () => cancelAnimationFrame(raf);
  }, [theme]);
  return colors;
}
