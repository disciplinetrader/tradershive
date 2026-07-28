/**
 * Application-level trigger helpers.
 *
 * Every place in the app that wants to send an email calls one of these
 * functions instead of touching the service directly. Keeps the surface
 * small and makes it trivial to audit which events actually produce mail.
 *
 * ⚠️ Server-only.
 */
import { dispatchEmail, type DispatchResult } from "./service.server";

export interface TriggerRecipient {
  email: string;
  userId?: string | null;
  name?: string | null;
}

/* ---------------- Security & transactional (always send) ---------------- */

export function triggerVerifyEmail(to: TriggerRecipient, verifyUrl: string): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "verify_email",
    props: { verifyUrl },
    immediate: true,
  });
}

export function triggerPasswordReset(to: TriggerRecipient, resetUrl: string): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "password_reset",
    props: { resetUrl },
    immediate: true,
  });
}

export function triggerPasswordChanged(
  to: TriggerRecipient,
  meta: { when: string; ip?: string | null } = { when: new Date().toUTCString() },
): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "password_changed",
    props: meta,
    immediate: true,
  });
}

export function triggerLoginAlert(
  to: TriggerRecipient,
  meta: { when: string; device?: string; ip?: string },
): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "login_alert",
    props: meta,
    immediate: true,
  });
}

/* ---------------- Product / lifecycle ---------------- */

export function triggerWelcome(to: TriggerRecipient): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "welcome",
    props: { name: to.name },
    immediate: true,
    dedupeKey: `welcome:${to.userId ?? to.email}`,
  });
}

/** Enqueue the whole welcome series (day 0 immediate + day 2 + day 5). */
export async function scheduleWelcomeSeries(to: TriggerRecipient): Promise<void> {
  const now = Date.now();
  await triggerWelcome(to);
  await dispatchEmail({
    to,
    templateId: "welcome_series_day2",
    props: { name: to.name },
    scheduledFor: new Date(now + 2 * 24 * 60 * 60 * 1000),
    dedupeKey: `welcome-d2:${to.userId ?? to.email}`,
  });
  await dispatchEmail({
    to,
    templateId: "welcome_series_day5",
    props: { name: to.name },
    scheduledFor: new Date(now + 5 * 24 * 60 * 60 * 1000),
    dedupeKey: `welcome-d5:${to.userId ?? to.email}`,
  });
}

export function triggerProductUpdate(
  to: TriggerRecipient,
  props: { headline: string; body: string; ctaLabel?: string; ctaUrl?: string; dedupeKey?: string },
): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "product_update",
    props,
    dedupeKey: props.dedupeKey ?? `product:${props.headline}:${to.email}`,
  });
}

/* ---------------- Engagement ---------------- */

export function triggerAchievementUnlocked(
  to: TriggerRecipient,
  props: { badgeName: string; badgeDescription: string; xp: number },
): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "achievement_unlocked",
    props: { name: to.name, ...props },
    dedupeKey: `ach:${props.badgeName}:${to.userId ?? to.email}`,
  });
}

export interface ReportPayload {
  periodLabel: string;
  trades: number;
  winRate: string;
  netPnl: string;
  bestTrade: string;
  worstTrade: string;
  topInsight?: string;
}

export function triggerWeeklyReport(to: TriggerRecipient, props: ReportPayload): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "weekly_report",
    props: { name: to.name, ...props },
    dedupeKey: `weekly:${props.periodLabel}:${to.userId ?? to.email}`,
  });
}

export function triggerMonthlyReport(to: TriggerRecipient, props: ReportPayload): Promise<DispatchResult> {
  return dispatchEmail({
    to,
    templateId: "monthly_report",
    props: { name: to.name, ...props },
    dedupeKey: `monthly:${props.periodLabel}:${to.userId ?? to.email}`,
  });
}

export function triggerReengagement(to: TriggerRecipient, days: 3 | 7 | 14 | 30): Promise<DispatchResult> {
  const templateId = (`reengagement_${days}d` as const);
  return dispatchEmail({
    to,
    templateId,
    props: { name: to.name },
    dedupeKey: `reeng:${days}:${to.userId ?? to.email}`,
  });
}

/* ---------------- Billing (scaffolded, disabled until beta ends) ---------------- */

export function triggerBillingReceipt(
  to: TriggerRecipient,
  props: { amount: string; period: string; invoiceUrl: string },
): Promise<DispatchResult> {
  return dispatchEmail({ to, templateId: "billing_receipt", props, immediate: true });
}

export function triggerBillingFailed(
  to: TriggerRecipient,
  props: { amount: string; updateUrl: string },
): Promise<DispatchResult> {
  return dispatchEmail({ to, templateId: "billing_failed", props, immediate: true });
}
