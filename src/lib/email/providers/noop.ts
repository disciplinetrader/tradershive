/**
 * Production placeholder provider.
 *
 * Deliberately never delivers. Reports success so queue jobs are marked
 * `skipped` rather than failing on retry loops during the closed beta,
 * before a real transactional provider (Resend, SES, Postmark, …) is
 * wired in.
 */
import type { EmailMessage, EmailProvider, EmailSendResult } from "../types";

export const noopEmailProvider: EmailProvider = {
  name: "noop",
  isConfigured: () => true,
  async send(_message: EmailMessage): Promise<EmailSendResult> {
    // `skipped: true` — succeeds without delivering, so the queue records
    // `skipped` (not `sent`). See EmailSendResult / O-1.
    return { ok: true, providerMessageId: null, provider: "noop", skipped: true };
  },
};
