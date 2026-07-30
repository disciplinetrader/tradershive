export function formatCurrency(n: number | null | undefined, currency = "USD"): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDurationLong(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (d > 0) return h > 0 ? `${plural(d, "Day")} ${plural(h, "Hour")}` : plural(d, "Day");
  if (h > 0) return m > 0 ? `${plural(h, "Hour")} ${plural(m, "Minute")}` : plural(h, "Hour");
  if (m > 0) return plural(m, "Minute");
  return plural(s, "Second");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function pnlTone(pnl: number | null | undefined): "up" | "down" | "flat" {
  if (pnl == null) return "flat";
  if (pnl > 0) return "up";
  if (pnl < 0) return "down";
  return "flat";
}

/**
 * Presentation helper. The canonical derivation lives in
 * `@/lib/journal/derive` — this only collapses "not measurable" to breakeven
 * for badge rendering.
 */
export function tradeResult(pnl: number | null | undefined): "win" | "loss" | "breakeven" {
  return resultOf(pnl) ?? "breakeven";
}


export function wordCount(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function stripHtml(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || el.innerText || "").replace(/\s+/g, " ").trim();
}

export function shortId(id: string | null | undefined): string {
  if (!id) return "";
  return id.slice(0, 8).toUpperCase();
}
