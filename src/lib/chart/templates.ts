/**
 * Chart templates — a saved snapshot of the chart's visual configuration
 * (chart type, active indicators, their parameters and the SMC toolkit).
 *
 * Stored locally so applying a template is instant and works offline; the
 * shape is JSON-serialisable so it can be synced later without migration.
 */

export interface ChartTemplate {
  id: string;
  name: string;
  builtIn?: boolean;
  chartType: string;
  indicators: Record<string, boolean>;
  params: Record<string, Record<string, number>>;
  smcOn: boolean;
  smcParts: Record<string, boolean>;
  updatedAt: string;
}

const KEY = "thive.chart.templates.v1";

export const BUILT_IN_TEMPLATES: ChartTemplate[] = [
  {
    id: "builtin-clean",
    name: "Clean Price Action",
    builtIn: true,
    chartType: "candles",
    indicators: { volume: true },
    params: {},
    smcOn: false,
    smcParts: {},
    updatedAt: "",
  },
  {
    id: "builtin-trend",
    name: "Trend Following",
    builtIn: true,
    chartType: "candles",
    indicators: { ema: true, sma: true, supertrend: true, volume: true },
    params: { ema: { length: 21 }, sma: { length: 200 }, supertrend: { period: 10, multiplier: 3 } },
    smcOn: false,
    smcParts: {},
    updatedAt: "",
  },
  {
    id: "builtin-scalping",
    name: "Scalping",
    builtIn: true,
    chartType: "candles",
    indicators: { ema: true, vwap: true, volume: true, rsi: true },
    params: { ema: { length: 9 }, rsi: { length: 7 } },
    smcOn: false,
    smcParts: {},
    updatedAt: "",
  },
  {
    id: "builtin-smc",
    name: "Smart Money (SMC/ICT)",
    builtIn: true,
    chartType: "candles",
    indicators: { volume: true, sessions: true },
    params: {},
    smcOn: true,
    smcParts: { show_swings: true, show_bos: true, show_fvg: true, show_ob: true },
    updatedAt: "",
  },
];

export function listTemplates(): ChartTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as ChartTemplate[]) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function persist(rows: ChartTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch { /* quota / private mode — ignore */ }
}

export function saveTemplate(t: Omit<ChartTemplate, "id" | "updatedAt"> & { id?: string }): ChartTemplate[] {
  const rows = listTemplates();
  const id = t.id ?? `tpl-${Date.now().toString(36)}`;
  const row: ChartTemplate = { ...t, id, updatedAt: new Date().toISOString() };
  const idx = rows.findIndex((r) => r.id === id || r.name.toLowerCase() === t.name.toLowerCase());
  if (idx >= 0) rows[idx] = row;
  else rows.unshift(row);
  persist(rows);
  return rows;
}

export function deleteTemplate(id: string): ChartTemplate[] {
  const rows = listTemplates().filter((r) => r.id !== id);
  persist(rows);
  return rows;
}
