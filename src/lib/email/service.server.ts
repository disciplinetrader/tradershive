/**
 * Server-only EmailService.
 *
 * Responsibilities:
 *   - Look up (or auto-create) recipient preferences and apply category gating.
 *   - Enforce the suppression list.
 *   - Enqueue jobs into `email_queue` and log every attempt into `email_events`.
 *   - Delegate actual delivery to the resolved `EmailProvider`.
 *   - Support a synchronous "send now" path for transactional / security emails
 *     and a queued path for engagement / marketing emails.
 *
 * Nothing in this file talks to a specific provider — plug in Resend / SES /
 * Postmark by dropping a new adapter in `./providers/*` and changing the
 * `EMAIL_PROVIDER` env var.
 *
 * ⚠️ Server-only — do NOT import from client/route/component modules directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_BRAND, getAppUrl } from "./brand";
import { resolveEmailProvider } from "./providers";
import { getTemplate } from "./templates";
import type {
  EmailCategory,
  EmailPreferenceKey,
  EmailPreferencesRow,
  EmailSendResult,
  EmailTemplateId,
  TemplateContext,
} from "./types";

const BILLING_ENABLED =
  (process.env.EMAIL_BILLING_ENABLED ?? "").toLowerCase() === "true";

async function getAdmin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function loadPrefsByUserId(userId: string): Promise<EmailPreferencesRow | null> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("email_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as EmailPreferencesRow;
  const insert = await admin
    .from("email_preferences")
    .insert({ user_id: userId })
    .select("*")
    .single();
  return (insert.data as EmailPreferencesRow) ?? null;
}

async function loadPrefsByEmail(email: string): Promise<EmailPreferencesRow | null> {
  const admin = await getAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!profile?.id) return null;
  return loadPrefsByUserId(profile.id as string);
}

async function isSuppressed(email: string): Promise<boolean> {
  const admin = await getAdmin();
  const { data } = await admin
    .from("email_suppressions")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

function checkPreference(
  prefs: EmailPreferencesRow | null,
  key: EmailPreferenceKey,
  alwaysSend: boolean,
): { allowed: true } | { allowed: false; reason: string } {
  if (alwaysSend || key === "security") return { allowed: true };
  if (!prefs) return { allowed: true }; // no row → default to permitted (will be created below)
  if (!prefs.master_enabled) return { allowed: false, reason: "master_disabled" };
  const value = prefs[key as keyof EmailPreferencesRow];
  if (typeof value === "boolean" && !value) return { allowed: false, reason: `pref_${key}_off` };
  return { allowed: true };
}

async function logEvent(row: {
  queue_id?: string | null;
  user_id?: string | null;
  to_email: string;
  category: EmailCategory;
  template: EmailTemplateId;
  subject?: string | null;
  status: string;
  provider?: string;
  provider_message_id?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = await getAdmin();
  await admin.from("email_events").insert({
    queue_id: row.queue_id ?? null,
    user_id: row.user_id ?? null,
    to_email: row.to_email.toLowerCase(),
    category: row.category,
    template: row.template,
    subject: row.subject ?? null,
    status: row.status,
    provider: row.provider ?? resolveEmailProvider().name,
    provider_message_id: row.provider_message_id ?? null,
    error: row.error ?? null,
    metadata: row.metadata ?? {},
  });
}

function buildContext(
  recipient: { email: string; name?: string | null; userId?: string | null },
  prefs: EmailPreferencesRow | null,
): TemplateContext {
  const appUrl = getAppUrl();
  const unsubscribeUrl = prefs?.unsubscribe_token
    ? `${appUrl}/settings/email?token=${prefs.unsubscribe_token}`
    : null;
  return {
    recipient: { email: recipient.email, name: recipient.name ?? null, userId: recipient.userId ?? null },
    appUrl,
    unsubscribeUrl,
    brand: EMAIL_BRAND,
    year: new Date().getFullYear(),
  };
}

export interface DispatchArgs<Props> {
  to: { email: string; userId?: string | null; name?: string | null };
  templateId: EmailTemplateId;
  props: Props;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  /** When true, bypass the queue and attempt delivery immediately. */
  immediate?: boolean;
  /** When set, the queue job runs at/after this time. Ignored if `immediate`. */
  scheduledFor?: Date;
}

export interface DispatchResult {
  ok: boolean;
  status: "queued" | "sent" | "skipped" | "suppressed" | "failed";
  reason?: string;
  queueId?: string;
  providerMessageId?: string | null;
}

/**
 * Primary entry point used by every trigger and cron job.
 * Handles preference gating, suppression, queueing, and event logging.
 */
export async function dispatchEmail<Props>(
  args: DispatchArgs<Props>,
): Promise<DispatchResult> {
  const template = getTemplate<Props>(args.templateId);
  const email = args.to.email.toLowerCase();

  // Billing shortcut — feature-flagged off during beta.
  if (template.category === "billing" && !BILLING_ENABLED) {
    await logEvent({
      user_id: args.to.userId ?? null,
      to_email: email,
      category: template.category,
      template: template.id,
      status: "skipped",
      error: "billing_disabled",
    });
    return { ok: false, status: "skipped", reason: "billing_disabled" };
  }

  if (await isSuppressed(email)) {
    await logEvent({
      user_id: args.to.userId ?? null,
      to_email: email,
      category: template.category,
      template: template.id,
      status: "suppressed",
    });
    return { ok: false, status: "suppressed", reason: "suppressed" };
  }

  const prefs = args.to.userId
    ? await loadPrefsByUserId(args.to.userId)
    : await loadPrefsByEmail(email);

  const check = checkPreference(prefs, template.preferenceKey, Boolean(template.alwaysSend));
  if (!check.allowed) {
    await logEvent({
      user_id: args.to.userId ?? null,
      to_email: email,
      category: template.category,
      template: template.id,
      status: "skipped",
      error: check.reason,
    });
    return { ok: false, status: "skipped", reason: check.reason };
  }

  const ctx = buildContext({ email, name: args.to.name ?? null, userId: args.to.userId ?? null }, prefs);
  const subject = template.subject(args.props);
  const { html, text } = template.render(args.props, ctx);

  if (!args.immediate) {
    const admin = await getAdmin();
    const insert = await admin
      .from("email_queue")
      .insert({
        user_id: args.to.userId ?? null,
        to_email: email,
        category: template.category,
        template: template.id,
        subject,
        payload: {
          props: args.props ?? {},
          metadata: args.metadata ?? {},
        },
        scheduled_for: (args.scheduledFor ?? new Date()).toISOString(),
        dedupe_key: args.dedupeKey ?? null,
      })
      .select("id")
      .single();
    if (insert.error) {
      // Unique dedupe collision counts as success — a job already exists.
      if ((insert.error as { code?: string }).code === "23505") {
        return { ok: true, status: "queued", reason: "duplicate" };
      }
      await logEvent({
        user_id: args.to.userId ?? null,
        to_email: email,
        category: template.category,
        template: template.id,
        subject,
        status: "failed",
        error: insert.error.message,
      });
      return { ok: false, status: "failed", reason: insert.error.message };
    }
    const queueId = insert.data?.id as string | undefined;
    await logEvent({
      queue_id: queueId ?? null,
      user_id: args.to.userId ?? null,
      to_email: email,
      category: template.category,
      template: template.id,
      subject,
      status: "queued",
    });
    return { ok: true, status: "queued", queueId };
  }

  // Immediate send path (transactional / security).
  const provider = resolveEmailProvider();
  const result: EmailSendResult = await provider.send({
    to: ctx.recipient,
    subject,
    html,
    text,
    category: template.category,
    template: template.id,
    metadata: args.metadata,
    dedupeKey: args.dedupeKey,
  });

  await logEvent({
    user_id: args.to.userId ?? null,
    to_email: email,
    category: template.category,
    template: template.id,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: result.provider,
    provider_message_id: result.ok ? result.providerMessageId : null,
    error: result.ok ? null : result.error,
  });

  return result.ok
    ? { ok: true, status: "sent", providerMessageId: result.providerMessageId }
    : { ok: false, status: "failed", reason: result.error };
}

/**
 * Worker used by the queue-processing cron route. Claims up to `limit` due
 * jobs, delivers them, and updates their status. Idempotent per job.
 */
export async function processQueueBatch(limit = 25): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  results: Array<{ id: string; status: string; error?: string }>;
}> {
  const admin = await getAdmin();
  const provider = resolveEmailProvider();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from("email_queue")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("priority", { ascending: true })
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  const results: Array<{ id: string; status: string; error?: string }> = [];
  let sent = 0;
  let failed = 0;

  for (const row of (due ?? []) as Array<{ id: string }>) {
    const claim = await admin
      .from("email_queue")
      .update({ status: "processing", locked_at: nowIso })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    const job = claim.data as
      | (Record<string, any> & { id: string; template: EmailTemplateId; to_email: string; category: EmailCategory; user_id: string | null; subject: string; payload: { props: any; metadata?: Record<string, unknown> }; attempts: number; max_attempts: number })
      | null;
    if (!job) {
      results.push({ id: row.id, status: "already_processing" });
      continue;
    }
    try {
      const template = getTemplate(job.template);
      const prefs = job.user_id ? await loadPrefsByUserId(job.user_id) : await loadPrefsByEmail(job.to_email);
      const ctx = buildContext(
        { email: job.to_email, userId: job.user_id ?? null, name: null },
        prefs,
      );
      const subject = job.subject || template.subject(job.payload.props);
      const { html, text } = template.render(job.payload.props, ctx);

      const result = await provider.send({
        to: ctx.recipient,
        subject,
        html,
        text,
        category: job.category,
        template: job.template,
        metadata: job.payload.metadata,
      });

      if (result.ok) {
        sent++;
        await admin.from("email_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", job.id);
        await logEvent({
          queue_id: job.id,
          user_id: job.user_id,
          to_email: job.to_email,
          category: job.category,
          template: job.template,
          subject,
          status: "sent",
          provider: result.provider,
          provider_message_id: result.providerMessageId,
        });
        results.push({ id: job.id, status: "sent" });
      } else {
        failed++;
        const attempts = (job.attempts ?? 0) + 1;
        const exhausted = attempts >= (job.max_attempts ?? 5) || !result.retryable;
        const backoffMin = Math.min(60, 2 ** attempts);
        await admin
          .from("email_queue")
          .update({
            status: exhausted ? "failed" : "pending",
            attempts,
            last_error: result.error,
            locked_at: null,
            scheduled_for: exhausted
              ? new Date().toISOString()
              : new Date(Date.now() + backoffMin * 60_000).toISOString(),
          })
          .eq("id", job.id);
        await logEvent({
          queue_id: job.id,
          user_id: job.user_id,
          to_email: job.to_email,
          category: job.category,
          template: job.template,
          subject,
          status: exhausted ? "failed" : "queued",
          provider: result.provider,
          error: result.error,
        });
        results.push({ id: job.id, status: exhausted ? "failed" : "retry", error: result.error });
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("email_queue")
        .update({ status: "failed", last_error: message, locked_at: null })
        .eq("id", job.id);
      await logEvent({
        queue_id: job.id,
        user_id: job.user_id,
        to_email: job.to_email,
        category: job.category,
        template: job.template,
        subject: job.subject,
        status: "failed",
        error: message,
      });
      results.push({ id: job.id, status: "failed", error: message });
    }
  }

  return { claimed: due?.length ?? 0, sent, failed, results };
}

export function activeProviderName(): string {
  return resolveEmailProvider().name;
}
