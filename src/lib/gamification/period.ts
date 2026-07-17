/** UTC period-key helpers for gamification. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
export function weekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day);
  return `W-${d.toISOString().slice(0, 10)}`;
}
export function monthKey(now = new Date()): string {
  return `M-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function specialKey(): string {
  return "PERPETUAL";
}
export function periodKeyForScope(scope: string, now = new Date()): string {
  if (scope === "daily") return todayKey(now);
  if (scope === "weekly") return weekKey(now);
  if (scope === "monthly") return monthKey(now);
  return specialKey();
}
export function periodEndsAt(scope: string, now = new Date()): Date | null {
  const d = new Date(now);
  if (scope === "daily") {
    d.setUTCHours(24, 0, 0, 0);
    return d;
  }
  if (scope === "weekly") {
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() + (7 - day));
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  if (scope === "monthly") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return null;
}
export function timeRemaining(target: Date | null | undefined): string {
  if (!target) return "—";
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}
