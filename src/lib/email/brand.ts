/** Central brand configuration used by every email template. */
import type { TemplateContext } from "./types";

export const EMAIL_BRAND: TemplateContext["brand"] = {
  name: "TradersHIVE Arena",
  logoUrl: null,
  primaryColor: "#F59E0B", // hive amber
  supportEmail: "support@tradershive.app",
};

export function getAppUrl(): string {
  // Prefer explicit env, fall back to the published beta URL.
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://tradershive.lovable.app"
  );
}
