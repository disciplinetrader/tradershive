import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/constants";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — TradersHIVE" },
      { name: "description", content: "The terms that govern your use of the TradersHIVE trading journal, replay studio and analytics platform." },
      { property: "og:title", content: "Terms of Service — TradersHIVE" },
      { property: "og:description", content: "Rules of use, account responsibilities and trading-risk disclaimers for TradersHIVE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Acceptance",
    body: [
      `By creating an account you agree to these terms. If you do not agree, do not use ${APP_NAME}.`,
      "We may update these terms; material changes are announced in-app before they take effect.",
    ],
  },
  {
    title: "2. What the platform is",
    body: [
      `${APP_NAME} is an education and analytics product: journaling, historical replay, backtesting and performance analytics.`,
      "It is not a broker, does not execute real orders, and does not hold client funds. All simulated trading is simulated only.",
    ],
  },
  {
    title: "3. No financial advice",
    body: [
      "Nothing on the platform — including AI-generated coaching, statistics or signals — is financial, investment, tax or legal advice.",
      "Trading carries substantial risk of loss. Past or simulated performance is never indicative of future results.",
    ],
  },
  {
    title: "4. Your account",
    body: [
      "You are responsible for keeping your credentials secure and for all activity under your account.",
      "One person per account. Do not share, resell or automate access without written permission.",
    ],
  },
  {
    title: "5. Acceptable use",
    body: [
      "No scraping, reverse engineering, load-testing, or attempts to bypass rate limits and access controls.",
      "No abusive, unlawful or misleading content in community features, shared strategies or chat.",
    ],
  },
  {
    title: "6. Market data",
    body: [
      "Historical and live market data is licensed from third-party providers and supplied on an as-is basis.",
      "Data may be delayed, adjusted or incomplete. Do not rely on it for real-money execution decisions.",
    ],
  },
  {
    title: "7. Availability and beta features",
    body: [
      "The service is provided as-is, without warranty of uninterrupted availability.",
      "Beta features may change or be withdrawn at any time.",
    ],
  },
  {
    title: "8. Termination",
    body: [
      "You may delete your account at any time from Settings.",
      "We may suspend accounts that breach these terms or put the platform's integrity at risk.",
    ],
  },
  {
    title: "9. Liability",
    body: [
      "To the maximum extent permitted by law, we are not liable for trading losses, lost profits or indirect damages arising from use of the platform.",
    ],
  },
  {
    title: "10. Contact",
    body: ["Questions about these terms: support@tradershive.app"],
  },
];

function TermsPage() {
  return <LegalPage title="Terms of Service" sections={SECTIONS} />;
}

export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: { title: string; body: string[] }[];
}) {
  return (
    <div className="dark min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
        <Link to="/" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          ← Back to {APP_NAME}
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated {new Date().getFullYear()} · Applies to all {APP_NAME} accounts.
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-base font-semibold">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-2 text-sm leading-relaxed text-muted-foreground">{p}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
