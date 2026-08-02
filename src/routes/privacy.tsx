import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "./terms";
import { APP_NAME } from "@/lib/constants";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — TradersHIVE" },
      { name: "description", content: "How TradersHIVE collects, stores and protects your account, journal and trading data." },
      { property: "og:title", content: "Privacy Policy — TradersHIVE" },
      { property: "og:description", content: "What data TradersHIVE stores, why, how long, and the controls you have over it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Data we collect",
    body: [
      "Account data: name, username, email, country, timezone, trading experience and preferences you enter at signup.",
      "Product data: journal entries, trades, replay sessions, drawings, notes, analytics settings and community activity.",
      "Technical data: authentication events, error reports and basic usage telemetry needed to keep the service running.",
    ],
  },
  {
    title: "2. Why we use it",
    body: [
      "To run your account, sync your work across devices, and produce your analytics and coaching feedback.",
      "To secure the platform (abuse prevention, rate limiting, audit trails) and to fix bugs.",
    ],
  },
  {
    title: "3. AI processing",
    body: [
      "When you use AI features (coaching, quick log, insights), the relevant trade or note content is sent to our AI provider to generate a response.",
      "AI providers are contractually bound not to train on your data.",
    ],
  },
  {
    title: "4. Sharing",
    body: [
      "We never sell your data.",
      "We share only with processors required to operate the service: hosting, database/auth, market-data and AI providers.",
      "Content you deliberately publish — shared strategies, leaderboards, community posts — is visible per its own visibility setting.",
    ],
  },
  {
    title: "5. Storage and security",
    body: [
      "Data is stored in managed cloud infrastructure with encryption in transit and at rest.",
      "Row-level access rules restrict every record to its owner unless you share it explicitly.",
    ],
  },
  {
    title: "6. Retention",
    body: [
      "We keep your data while your account is active.",
      "Deleting your account removes your personal data and private content; anonymised aggregates may be retained.",
    ],
  },
  {
    title: "7. Your rights",
    body: [
      "You can access, export, correct or delete your data from Settings, or by contacting us.",
      "You can opt out of non-essential email at any time.",
    ],
  },
  {
    title: "8. Cookies",
    body: [
      "We use strictly necessary cookies and local storage for sessions, preferences and draft recovery. No advertising trackers.",
    ],
  },
  {
    title: "9. Contact",
    body: [`Privacy questions: privacy@tradershive.app — we respond within 30 days.`],
  },
];

function PrivacyPage() {
  return <LegalPage title={`Privacy Policy · ${APP_NAME}`} sections={SECTIONS} />;
}
