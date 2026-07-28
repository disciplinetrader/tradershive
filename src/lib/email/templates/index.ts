/**
 * Template registry. Each entry is a self-contained `EmailTemplate<Props>`
 * with `subject(props)` and `render(props, ctx)`. Add new templates here
 * and in `EmailTemplateId` (`../types.ts`).
 */
import type { EmailTemplate, EmailTemplateId } from "../types";
import {
  button,
  card,
  divider,
  heading,
  htmlToText,
  layout,
  paragraph,
  statRow,
  subtle,
} from "./components";

/* -------------------------- shared helpers -------------------------- */

function greet(name?: string | null): string {
  return name ? `Hey ${name.split(" ")[0]},` : "Hey trader,";
}

function wrap(
  ctx: Parameters<EmailTemplate["render"]>[1],
  preheader: string,
  body: string,
) {
  const html = layout({
    preheader,
    body,
    unsubscribeUrl: ctx.unsubscribeUrl,
    brandName: ctx.brand.name,
  });
  return { html, text: htmlToText(html) };
}

/* ---------------------------- templates ---------------------------- */

const welcome: EmailTemplate<{ name?: string | null }> = {
  id: "welcome",
  category: "product",
  preferenceKey: "welcome_series",
  subject: () => "Welcome to TradersHIVE — your arena is ready",
  render: (props, ctx) =>
    wrap(
      ctx,
      "Your $10,000 demo account is waiting.",
      [
        heading("Welcome to the Hive 🐝"),
        paragraph(`${greet(props.name)} you're in the closed beta of TradersHIVE Arena.`),
        paragraph(
          "You've got a $10,000 paper account, professional charts, an AI trading coach, and a live tournament arena. Let's get you your first backtest.",
        ),
        button("Launch your first backtest", `${ctx.appUrl}/replay`),
        subtle("Reply to this email any time — a real human reads every message during beta."),
      ].join(""),
    ),
};

const verifyEmail: EmailTemplate<{ verifyUrl: string }> = {
  id: "verify_email",
  category: "security",
  preferenceKey: "security",
  alwaysSend: true,
  subject: () => "Verify your TradersHIVE email",
  render: (props, ctx) =>
    wrap(
      ctx,
      "One click to confirm your address.",
      [
        heading("Confirm your email"),
        paragraph("Tap the button below to confirm this address. The link expires in 24 hours."),
        button("Verify email", props.verifyUrl),
        subtle("Didn't sign up? You can safely ignore this email."),
      ].join(""),
    ),
};

const passwordReset: EmailTemplate<{ resetUrl: string }> = {
  id: "password_reset",
  category: "security",
  preferenceKey: "security",
  alwaysSend: true,
  subject: () => "Reset your TradersHIVE password",
  render: (props, ctx) =>
    wrap(
      ctx,
      "Reset link inside — expires in 1 hour.",
      [
        heading("Reset your password"),
        paragraph("Use the button below to choose a new password. This link expires in 1 hour."),
        button("Choose a new password", props.resetUrl),
        subtle("If you didn't request this, ignore this email — your password stays the same."),
      ].join(""),
    ),
};

const passwordChanged: EmailTemplate<{ when: string; ip?: string | null }> = {
  id: "password_changed",
  category: "security",
  preferenceKey: "security",
  alwaysSend: true,
  subject: () => "Your TradersHIVE password was changed",
  render: (props, ctx) =>
    wrap(
      ctx,
      "Security alert.",
      [
        heading("Password updated"),
        paragraph(`Your password was changed on ${props.when}${props.ip ? ` from ${props.ip}` : ""}.`),
        paragraph("If this wasn't you, reset your password immediately and contact support."),
        button("Secure my account", `${ctx.appUrl}/settings`),
      ].join(""),
    ),
};

const loginAlert: EmailTemplate<{ when: string; device?: string; ip?: string }> = {
  id: "login_alert",
  category: "security",
  preferenceKey: "security",
  alwaysSend: true,
  subject: () => "New sign-in to TradersHIVE",
  render: (props, ctx) =>
    wrap(
      ctx,
      "A new device signed in to your account.",
      [
        heading("New sign-in detected"),
        paragraph(
          `We noticed a sign-in on ${props.when}${props.device ? ` from ${props.device}` : ""}${props.ip ? ` (${props.ip})` : ""}.`,
        ),
        paragraph("If this was you, no action is needed. Otherwise, secure your account now."),
        button("Review activity", `${ctx.appUrl}/settings`),
      ].join(""),
    ),
};

const welcomeDay2: EmailTemplate<{ name?: string | null }> = {
  id: "welcome_series_day2",
  category: "product",
  preferenceKey: "welcome_series",
  subject: () => "Day 2 — Journal your first trade",
  render: (props, ctx) =>
    wrap(
      ctx,
      "The traders who journal improve 3× faster.",
      [
        heading("The 5-minute habit that changes everything"),
        paragraph(`${greet(props.name)} the top 1% of traders share one habit: they journal every trade.`),
        paragraph(
          "TradersHIVE Journal auto-detects your session, position type, and outcome — you just add context. Try it now on any recent paper trade.",
        ),
        button("Open Journal", `${ctx.appUrl}/journal`),
      ].join(""),
    ),
};

const welcomeDay5: EmailTemplate<{ name?: string | null }> = {
  id: "welcome_series_day5",
  category: "product",
  preferenceKey: "welcome_series",
  subject: () => "Day 5 — Meet your AI trading coach",
  render: (props, ctx) =>
    wrap(
      ctx,
      "Turn your history into a personal playbook.",
      [
        heading("Your data is the coach"),
        paragraph(`${greet(props.name)} the AI Trading Coach reads every trade, journal entry, and mistake — then tells you exactly what to fix next.`),
        button("Talk to your coach", `${ctx.appUrl}/ai`),
      ].join(""),
    ),
};

const productUpdate: EmailTemplate<{
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}> = {
  id: "product_update",
  category: "product",
  preferenceKey: "product_updates",
  subject: (p) => p.headline,
  render: (props, ctx) =>
    wrap(
      ctx,
      props.headline,
      [
        heading(props.headline),
        paragraph(props.body),
        props.ctaUrl && props.ctaLabel ? button(props.ctaLabel, props.ctaUrl) : "",
      ].join(""),
    ),
};

const achievementUnlocked: EmailTemplate<{
  name?: string | null;
  badgeName: string;
  badgeDescription: string;
  xp: number;
}> = {
  id: "achievement_unlocked",
  category: "engagement",
  preferenceKey: "achievements",
  subject: (p) => `🏆 Achievement unlocked: ${p.badgeName}`,
  render: (props, ctx) =>
    wrap(
      ctx,
      `You just earned ${props.badgeName} — +${props.xp} XP.`,
      [
        heading(`🏆 ${props.badgeName}`),
        paragraph(`${greet(props.name)} nice work — you just unlocked a new badge.`),
        card(paragraph(props.badgeDescription) + subtle(`Reward: +${props.xp} XP`)),
        button("View your achievements", `${ctx.appUrl}/achievements`),
      ].join(""),
    ),
};

interface ReportProps {
  name?: string | null;
  periodLabel: string;
  trades: number;
  winRate: string;
  netPnl: string;
  bestTrade: string;
  worstTrade: string;
  topInsight?: string;
}

function renderReport(scope: "weekly" | "monthly") {
  return {
    subject: (p: ReportProps) =>
      scope === "weekly" ? `Your week in numbers — ${p.periodLabel}` : `Your month in numbers — ${p.periodLabel}`,
    render: (props: ReportProps, ctx: Parameters<EmailTemplate["render"]>[1]) =>
      wrap(
        ctx,
        `${props.trades} trades · ${props.winRate} win rate · ${props.netPnl} net`,
        [
          heading(scope === "weekly" ? "Your trading week" : "Your trading month"),
          paragraph(`${greet(props.name)} here's how ${props.periodLabel} went.`),
          statRow([
            { label: "Trades", value: String(props.trades) },
            { label: "Win rate", value: props.winRate },
            { label: "Net P/L", value: props.netPnl },
          ]),
          card(
            paragraph(`Best trade: ${props.bestTrade}`) +
              paragraph(`Worst trade: ${props.worstTrade}`),
          ),
          props.topInsight ? paragraph(`💡 ${props.topInsight}`) : "",
          divider(),
          button("Open Analytics", `${ctx.appUrl}/analytics`),
        ].join(""),
      ),
  };
}

const weeklyReport: EmailTemplate<ReportProps> = {
  id: "weekly_report",
  category: "engagement",
  preferenceKey: "weekly_report",
  ...renderReport("weekly"),
};

const monthlyReport: EmailTemplate<ReportProps> = {
  id: "monthly_report",
  category: "engagement",
  preferenceKey: "monthly_report",
  ...renderReport("monthly"),
};

function reengagement(days: 3 | 7 | 14 | 30): EmailTemplate<{ name?: string | null }> {
  const headlines: Record<number, [string, string]> = {
    3: ["Your account misses you 👀", "Jump back in for 5 minutes — one replay run and your streak stays alive."],
    7: ["A whole week off the charts", "Momentum matters. Come run one quick backtest and reset your rhythm."],
    14: ["Let's build a comeback week", "Two weeks away is fine — one focused session is all it takes to get back in it."],
    30: ["We've been holding your seat", "You've been away a month. Come back to a fresh backtest picked just for you."],
  };
  const [subject, body] = headlines[days];
  return {
    id: `reengagement_${days}d` as EmailTemplateId,
    category: "engagement",
    preferenceKey: "reengagement",
    subject: () => subject,
    render: (props, ctx) =>
      wrap(
        ctx,
        subject,
        [
          heading(subject),
          paragraph(`${greet(props.name)} ${body}`),
          button("Launch a quick backtest", `${ctx.appUrl}/replay`),
        ].join(""),
      ),
  };
}

// Billing templates — scaffolded but disabled until subscriptions ship.
const billingReceipt: EmailTemplate<{ amount: string; period: string; invoiceUrl: string }> = {
  id: "billing_receipt",
  category: "billing",
  preferenceKey: "billing",
  subject: (p) => `Receipt for ${p.period} — ${p.amount}`,
  render: (props, ctx) =>
    wrap(
      ctx,
      `Your ${props.period} receipt.`,
      [
        heading("Thanks for supporting TradersHIVE"),
        paragraph(`We charged ${props.amount} for your ${props.period} subscription.`),
        button("View invoice", props.invoiceUrl),
      ].join(""),
    ),
};

const billingFailed: EmailTemplate<{ amount: string; updateUrl: string }> = {
  id: "billing_failed",
  category: "billing",
  preferenceKey: "billing",
  subject: () => "Payment failed — please update your card",
  render: (props, ctx) =>
    wrap(
      ctx,
      "Update your card to keep your account active.",
      [
        heading("We couldn't charge your card"),
        paragraph(`Your payment of ${props.amount} didn't go through. Update your card to keep pro features active.`),
        button("Update payment method", props.updateUrl),
      ].join(""),
    ),
};

/* --------------------------- registry --------------------------- */

export const TEMPLATES = {
  welcome,
  verify_email: verifyEmail,
  password_reset: passwordReset,
  password_changed: passwordChanged,
  login_alert: loginAlert,
  welcome_series_day2: welcomeDay2,
  welcome_series_day5: welcomeDay5,
  product_update: productUpdate,
  achievement_unlocked: achievementUnlocked,
  weekly_report: weeklyReport,
  monthly_report: monthlyReport,
  reengagement_3d: reengagement(3),
  reengagement_7d: reengagement(7),
  reengagement_14d: reengagement(14),
  reengagement_30d: reengagement(30),
  billing_receipt: billingReceipt,
  billing_failed: billingFailed,
} satisfies Record<EmailTemplateId, EmailTemplate<any>>;

export function getTemplate<T = unknown>(id: EmailTemplateId): EmailTemplate<T> {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Unknown email template: ${id}`);
  return t as EmailTemplate<T>;
}

export function listTemplateIds(): EmailTemplateId[] {
  return Object.keys(TEMPLATES) as EmailTemplateId[];
}
