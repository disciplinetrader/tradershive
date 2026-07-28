/**
 * Table-based HTML component builders for emails.
 *
 * Every component returns a plain HTML string. We use `<table>` layouts and
 * inline styles because major mail clients still ignore modern CSS. All
 * templates compose from these helpers so branding stays consistent.
 */
import { EMAIL_BRAND } from "../brand";

const PRIMARY = EMAIL_BRAND.primaryColor;
const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const BG = "#f8fafc";
const CARD_BG = "#ffffff";

export function escape(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function layout(opts: {
  preheader: string;
  body: string;
  unsubscribeUrl?: string | null;
  brandName?: string;
}): string {
  const brand = opts.brandName ?? EMAIL_BRAND.name;
  const unsub = opts.unsubscribeUrl
    ? `<a href="${opts.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a> · `
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(brand)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escape(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CARD_BG};border-radius:16px;border:1px solid ${BORDER};overflow:hidden">
      <tr><td style="padding:28px 32px;border-bottom:1px solid ${BORDER};background:linear-gradient(135deg,${PRIMARY}12,transparent)">
        <div style="font-size:20px;font-weight:800;letter-spacing:-0.01em;color:${TEXT}">${escape(brand)}</div>
        <div style="font-size:12px;color:${MUTED};margin-top:2px">Trade smarter. Compete harder.</div>
      </td></tr>
      <tr><td style="padding:32px">${opts.body}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid ${BORDER};font-size:12px;color:${MUTED};line-height:1.6">
        ${unsub}<a href="mailto:${EMAIL_BRAND.supportEmail}" style="color:${MUTED};text-decoration:underline">Contact support</a>
        <div style="margin-top:8px">© ${new Date().getFullYear()} ${escape(brand)}. All rights reserved.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:24px;font-weight:800;line-height:1.25;color:${TEXT}">${escape(text)}</h1>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXT}">${escape(text)}</p>`;
}

export function subtle(text: string): string {
  return `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${MUTED}">${escape(text)}</p>`;
}

export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:${PRIMARY}">
<a href="${href}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#0b0f17;text-decoration:none">${escape(label)}</a>
</td></tr></table>`;
}

export function card(inner: string): string {
  return `<div style="border:1px solid ${BORDER};border-radius:12px;padding:18px;margin:0 0 20px;background:${BG}">${inner}</div>`;
}

export function statRow(items: Array<{ label: string; value: string }>): string {
  const cols = items
    .map(
      (i) => `<td align="center" style="padding:10px 8px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${MUTED};font-weight:700">${escape(i.label)}</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px;color:${TEXT}">${escape(i.value)}</div>
      </td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:12px;background:${BG};margin:0 0 20px"><tr>${cols}</tr></table>`;
}

export function divider(): string {
  return `<div style="height:1px;background:${BORDER};margin:20px 0"></div>`;
}

/** Convert HTML → plain-text fallback. Deliberately simple. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
