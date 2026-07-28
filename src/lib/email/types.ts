/**
 * Provider-agnostic email types.
 *
 * The rest of the app depends only on these types + the `EmailProvider`
 * interface. Wiring a real transactional provider (Resend, Postmark, SES…)
 * means adding a new implementation under `./providers/*` and pointing
 * `resolveEmailProvider()` at it — no other code changes.
 */

export type EmailCategory =
  | "transactional" // password reset, verification, security
  | "product"       // welcome series, product tour, onboarding
  | "engagement"    // achievements, reengagement, weekly/monthly reports
  | "marketing"     // announcements, newsletters (opt-in only)
  | "billing"       // invoices, receipts (SCAFFOLDED, DISABLED for beta)
  | "security";     // password changed, login alert — always sends

/** All templates registered in the system. Add here + in `templates/index.ts`. */
export type EmailTemplateId =
  // transactional / security
  | "welcome"
  | "verify_email"
  | "password_reset"
  | "password_changed"
  | "login_alert"
  // product / lifecycle
  | "welcome_series_day2"
  | "welcome_series_day5"
  | "product_update"
  // engagement
  | "achievement_unlocked"
  | "weekly_report"
  | "monthly_report"
  | "reengagement_3d"
  | "reengagement_7d"
  | "reengagement_14d"
  | "reengagement_30d"
  // billing (disabled during beta)
  | "billing_receipt"
  | "billing_failed";

export interface EmailRecipient {
  email: string;
  userId?: string | null;
  name?: string | null;
}

export interface EmailMessage {
  to: EmailRecipient;
  subject: string;
  html: string;
  text: string;
  category: EmailCategory;
  template: EmailTemplateId;
  /** For provider-side tagging / analytics. */
  metadata?: Record<string, unknown>;
  /** Idempotency key so a provider can deduplicate retries. */
  dedupeKey?: string;
}

export type EmailSendResult =
  | { ok: true; providerMessageId: string | null; provider: string }
  | { ok: false; error: string; retryable: boolean; provider: string };

/**
 * Every email provider (console, noop, Resend, SES…) implements this.
 * Implementations must be pure adapters: no queue writes, no event logging.
 * The `EmailService` handles queueing, logging, preferences, and retries.
 */
export interface EmailProvider {
  readonly name: string;
  /** True when the provider can actually deliver mail (e.g. keys present). */
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailTemplate<TProps = unknown> {
  id: EmailTemplateId;
  category: EmailCategory;
  /** Preference flag on `email_preferences` that gates this template. */
  preferenceKey: EmailPreferenceKey;
  /** True when the template must always send (e.g. password reset). */
  alwaysSend?: boolean;
  subject: (props: TProps) => string;
  render: (props: TProps, ctx: TemplateContext) => { html: string; text: string };
}

export interface TemplateContext {
  recipient: EmailRecipient;
  appUrl: string;
  unsubscribeUrl: string | null;
  brand: {
    name: string;
    logoUrl: string | null;
    primaryColor: string;
    supportEmail: string;
  };
  year: number;
}

export type EmailPreferenceKey =
  | "welcome_series"
  | "weekly_report"
  | "monthly_report"
  | "achievements"
  | "product_updates"
  | "reengagement"
  | "marketing"
  | "billing"
  | "security"; // "security" is a virtual key that is always true.

export interface EmailPreferencesRow {
  user_id: string;
  master_enabled: boolean;
  welcome_series: boolean;
  weekly_report: boolean;
  monthly_report: boolean;
  achievements: boolean;
  product_updates: boolean;
  reengagement: boolean;
  marketing: boolean;
  billing: boolean;
  unsubscribe_token: string;
}
