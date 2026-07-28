/**
 * Development / preview email provider.
 *
 * Writes the outgoing message to server logs instead of contacting any
 * external service. Always reports success so upstream code paths
 * (queues, retries, analytics) behave exactly as they will in production.
 */
import type { EmailMessage, EmailProvider, EmailSendResult } from "../types";

export const consoleEmailProvider: EmailProvider = {
  name: "console",
  isConfigured: () => true,
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const preview = message.text.slice(0, 240).replace(/\s+/g, " ").trim();
    // eslint-disable-next-line no-console
    console.info(
      `[email:console] → ${message.to.email} [${message.category}/${message.template}] "${message.subject}" — ${preview}${preview.length >= 240 ? "…" : ""}`,
    );
    return {
      ok: true,
      providerMessageId: `console_${Date.now().toString(36)}`,
      provider: "console",
    };
  },
};
