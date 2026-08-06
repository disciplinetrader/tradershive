import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
// Final text update pass: August 2026.

import { motion, useScroll, useTransform, AnimatePresence, type Variants } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  CircleDot,
  Clock,
  Code2,
  Compass,
  Cpu,
  Film,
  Gauge,
  Github,
  LineChart,
  Linkedin,
  Mail,
  Menu,
  MessageCircle,
  Play,
  Rocket,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Twitter,
  Video,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/use-auth";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/* ================================================================== */
/* Route                                                                */
/* ================================================================== */

const HEADLINE = "Become the Trader You Were Meant to Be";
const SUBHEAD =
  "Replay markets, journal every trade, analyse your performance and get AI-powered coaching — one professional workspace built for serious traders.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TradersHIVE — The Professional Trader's Workspace" },
      {
        name: "description",
        content:
          "TradersHIVE is the all-in-one trading workspace: market replay, journal, analytics and an AI coach that learns from every trade. Join the closed beta.",
      },
      { property: "og:title", content: "TradersHIVE — The Professional Trader's Workspace" },
      {
        property: "og:description",
        content:
          "Replay markets, journal every trade, analyse performance and get AI coaching. Join the closed beta.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tradershive.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "TradersHIVE — The Professional Trader's Workspace" },
      {
        name: "twitter:description",
        content:
          "Replay, journal, analyse and coach — one workspace for serious traders. Join the closed beta.",
      },
      { name: "theme-color", content: "#0b0f13" },
    ],
    links: [{ rel: "canonical", href: "https://tradershive.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "TradersHIVE",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "Professional trading workspace with market replay, journal, analytics and AI coach.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: LandingPage,
});

/* ================================================================== */
/* Page                                                                 */
/* ================================================================== */

function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="dark relative min-h-dvh overflow-x-hidden bg-background text-foreground antialiased">
      <AmbientBackground />
      <Navbar />
      <main id="main">
        <Hero />
        <TrustBar />
        <FeatureOverview />
        <ReplayShowcase />
        <AICoachShowcase />
        <AnalyticsShowcase />
        <WorkspaceShowcase />
        <Comparison />
        <BetaSection />
        <Roadmap />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

/* ================================================================== */
/* Ambient background                                                   */
/* ================================================================== */

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background">
      {/* Single restrained top glow — terminal-dark, no rainbow blobs */}
      <div className="absolute -top-72 left-1/2 h-[900px] w-[1400px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.14),transparent_72%)] blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.35),transparent)]" />
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)/0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.06) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, #000 40%, transparent 100%)",
        }}
      />
    </div>
  );
}


/* ================================================================== */
/* Navbar                                                               */
/* ================================================================== */

const NAV_LINKS: { label: string; href: string; badge?: string }[] = [
  { label: "Features", href: "#features" },
  { label: "Replay Studio", href: "#replay" },
  { label: "AI Coach", href: "#ai" },
  { label: "Pricing", href: "#pricing", badge: "Soon" },
  { label: "Roadmap", href: "#roadmap" },
  { label: "FAQ", href: "#faq" },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-full border px-3 pl-5 transition-all duration-300 sm:h-16",
          scrolled
            ? "border-border/70 bg-background/80 shadow-[0_10px_40px_-12px_hsl(var(--background))] backdrop-blur-xl"
            : "border-border/40 bg-background/50 backdrop-blur-md",
        )}
      >
        <Link to="/" className="group flex items-center gap-2" aria-label={APP_NAME}>
          <LogoMark />
          <span className="text-sm font-semibold uppercase tracking-[0.14em] sm:text-base">
            {APP_NAME}
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {l.label}
              {l.badge ? (
                <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {l.badge}
                </span>
              ) : null}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {user ? (
            <Button asChild size="sm" className="h-10 rounded-full px-5">
              <Link to="/dashboard">
                Open App <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-10 rounded-full px-4 text-muted-foreground hover:text-foreground"
              >
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="h-10 rounded-full px-5 font-medium">
                <Link to="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/60 lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>


      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 max-w-6xl overflow-hidden rounded-3xl border border-border/60 bg-background/95 backdrop-blur-xl lg:hidden"
          >
            <div className="flex flex-col gap-1 p-4">

              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-lg px-3 py-3 text-sm hover:bg-muted"
                >
                  <span>{l.label}</span>
                  {l.badge ? (
                    <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px]">
                      {l.badge}
                    </span>
                  ) : null}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link to="/register">Join Beta</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function LogoMark() {
  return (
    <div className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/25">
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 text-primary-foreground"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 2l3.5 6.1L22 9.3l-5 4.9 1.2 7L12 17.9 5.8 21.2 7 14.2l-5-4.9 6.5-1.2L12 2z" />
      </svg>
    </div>
  );
}

/* ================================================================== */
/* Section primitives                                                   */
/* ================================================================== */

function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("relative z-10 scroll-mt-24 py-24 sm:py-32", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

function EyebrowBadge({ children, icon: Icon }: { children: ReactNode; icon?: typeof Sparkles }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
      {Icon ? <Icon className="h-3.5 w-3.5 text-primary" /> : null}
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  center = true,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cn("mx-auto max-w-3xl", center && "text-center")}>
      {eyebrow ? (
        <div className={cn("mb-4", center && "flex justify-center")}>
          <EyebrowBadge icon={Sparkles}>{eyebrow}</EyebrowBadge>
        </div>
      ) : null}
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

/* ================================================================== */
/* Hero                                                                 */
/* ================================================================== */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <section ref={ref} className="relative z-10 overflow-hidden pt-28 sm:pt-36">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <motion.div initial="hidden" animate="show" variants={fadeUp} custom={0}>
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Now in closed beta · free to join
          </span>
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="show"
          variants={fadeUp}
          custom={1}
          className="mx-auto mt-8 max-w-4xl text-balance font-display text-[2.75rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl lg:text-[5.25rem]"
        >
          Your strategy shouldn&apos;t be
          <br />
          <span className="bg-gradient-to-b from-foreground/70 to-muted-foreground/50 bg-clip-text text-transparent">
            tested with real money
          </span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="show"
          variants={fadeUp}
          custom={2}
          className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {SUBHEAD}
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          custom={3}
          className="mt-9 flex flex-col items-center gap-3"
        >
          <Button
            asChild
            size="lg"
            className="h-14 rounded-full px-9 text-base font-medium shadow-[0_16px_50px_-16px_hsl(var(--primary))]"
          >
            <Link to="/register">Get started for free</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Start for free. No credit card required.
          </p>
        </motion.div>
      </div>

      {/* Product surface — the hero's centrepiece */}
      <div className="relative mx-auto mt-16 max-w-7xl px-4 sm:mt-20 sm:px-6 lg:px-8">
        <HeroMockup className="max-w-6xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      <ul className="mx-auto mt-12 flex max-w-3xl flex-wrap justify-center gap-x-8 gap-y-2 px-4 text-sm text-muted-foreground">
        {["No credit card", "Forex · Crypto · Stocks", "Cancel anytime"].map((t) => (
          <li key={t} className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-success" /> {t}
          </li>
        ))}
      </ul>

    </section>
  );
}


function HeroMockup({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-full max-w-2xl", className)}>

      <div className="absolute -inset-8 rounded-[40px] bg-[radial-gradient(closest-side,hsl(var(--primary)/0.25),transparent_75%)] blur-3xl" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          </div>
          <div className="ml-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDot className="h-3 w-3 text-success" /> EURUSD · 5m · Live
          </div>
          <div className="ml-auto text-xs text-muted-foreground">Trading Workspace</div>
        </div>

        <div className="grid grid-cols-[1fr_180px] gap-0">
          <div className="relative aspect-[16/8] bg-gradient-to-br from-background to-muted/30 p-4">
            <MockChart />
            <FloatingCard className="absolute left-4 top-4" tone="up">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Session P&L
              </div>
              <div className="text-lg font-semibold text-success">+$1,284.50</div>
              <div className="text-[10px] text-success/80">▲ +2.14% · 7 trades</div>
            </FloatingCard>
            <FloatingCard className="absolute bottom-4 right-4" tone="neutral">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Brain className="h-3 w-3 text-primary" /> AI Coach
              </div>
              <div className="mt-1 text-xs font-medium">You're strongest on London open.</div>
              <div className="text-[10px] text-muted-foreground">Ranked #1 of 4 sessions</div>
            </FloatingCard>
          </div>
          <div className="border-l border-border/60 bg-muted/20 p-3 text-xs">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Positions
            </div>
            <MockRow ticker="EURUSD" side="long" pnl="+$412" up />
            <MockRow ticker="XAUUSD" side="long" pnl="+$680" up />
            <MockRow ticker="BTCUSD" side="short" pnl="-$92" />
            <div className="my-3 h-px bg-border/60" />
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Playbook
            </div>
            <MockRow ticker="Liquidity Sweep" side="setup" pnl="72% WR" up />
            <MockRow ticker="London Reversal" side="setup" pnl="61% WR" up />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function MockChart() {
  const bars = useMemo(() => {
    // Deterministic PRNG so SSR and client render identical SVG (no hydration mismatch).
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const arr: { x: number; o: number; h: number; l: number; c: number; up: boolean }[] = [];
    let price = 40;
    for (let i = 0; i < 44; i++) {
      const o = price;
      const c = price + (Math.sin(i * 0.6) + (rand() - 0.5)) * 4;
      const h = Math.max(o, c) + rand() * 3;
      const l = Math.min(o, c) - rand() * 3;
      arr.push({ x: i, o, h, l, c, up: c >= o });
      price = c;
    }
    return arr;
  }, []);

  return (
    <svg viewBox="0 0 440 240" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 6 }).map((_, i) => (
        <line
          key={i}
          x1="0"
          x2="440"
          y1={40 * i + 20}
          y2={40 * i + 20}
          stroke="hsl(var(--border))"
          strokeOpacity="0.4"
          strokeDasharray="2 4"
        />
      ))}
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        d={bars.map((b, i) => `${i === 0 ? "M" : "L"} ${i * 10 + 5} ${220 - b.c * 3}`).join(" ")}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
      />
      <path
        d={
          bars.map((b, i) => `${i === 0 ? "M" : "L"} ${i * 10 + 5} ${220 - b.c * 3}`).join(" ") +
          ` L 440 240 L 0 240 Z`
        }
        fill="url(#g)"
      />
      {bars.map((b, i) => (
        <g key={i}>
          <line
            x1={i * 10 + 5}
            x2={i * 10 + 5}
            y1={220 - b.h * 3}
            y2={220 - b.l * 3}
            stroke={b.up ? "hsl(var(--success))" : "hsl(var(--danger))"}
            strokeWidth="1"
          />
          <rect
            x={i * 10 + 2}
            y={220 - Math.max(b.o, b.c) * 3}
            width="6"
            height={Math.max(1.5, Math.abs(b.c - b.o) * 3)}
            fill={b.up ? "hsl(var(--success))" : "hsl(var(--danger))"}
            opacity="0.85"
          />
        </g>
      ))}
    </svg>
  );
}

function FloatingCard({
  className,
  children,
  tone,
}: {
  className?: string;
  children: ReactNode;
  tone: "up" | "down" | "neutral";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.6 }}
      className={cn(
        "min-w-[168px] rounded-xl border border-border/60 bg-background/85 p-3 shadow-xl backdrop-blur-xl",
        tone === "up" && "ring-1 ring-success/20",
        tone === "down" && "ring-1 ring-danger/20",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function MockRow({
  ticker,
  side,
  pnl,
  up,
}: {
  ticker: string;
  side: string;
  pnl: string;
  up?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <div className="font-medium text-foreground">{ticker}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{side}</div>
      </div>
      <div className={cn("font-mono text-xs", up ? "text-success" : "text-danger")}>{pnl}</div>
    </div>
  );
}

/* ================================================================== */
/* Trust bar                                                            */
/* ================================================================== */

function TrustBar() {
  const stats = [
    { label: "Markets covered", value: "Forex · Crypto · Stocks" },
    { label: "Historical data", value: "Tick-accurate" },
    { label: "Timeframes", value: "1m → 1M" },
    { label: "AI coaching", value: "24/7" },
  ];
  return (
    <Section className="!py-16">
      <div className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Built for serious traders across Forex, Crypto &amp; Stocks
      </div>
      <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-8 border-t border-border/40 pt-12 md:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={fadeUp}
            custom={i}
            className="text-center"
          >
            <div className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {s.value}
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              {s.label}
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ================================================================== */
/* Feature Overview                                                     */
/* ================================================================== */

const BENTO_SMALL: { icon: typeof Film; title: string; desc: string; href: string }[] = [
  {
    icon: BookOpen,
    title: "Trading Journal",
    desc: "Automatic logging with screenshots, tags, R-multiples and emotional context.",
    href: "#features",
  },
  {
    icon: Shield,
    title: "Prop Challenges",
    desc: "Simulate institutional evaluations with strict drawdown and payout rules.",
    href: "#workspace",
  },
  {
    icon: TrendingUp,
    title: "Global Rankings",
    desc: "Climb the leaderboard and prove your edge against traders worldwide.",
    href: "#workspace",
  },
];

function BentoTile({
  className,
  children,
  href,
  delay = 0,
}: {
  className?: string;
  children: ReactNode;
  href: string;
  delay?: number;
}) {
  return (
    <motion.a
      href={href}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
      custom={delay}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-border/60 bg-surface p-8 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10",
        className,
      )}
    >
      {children}
    </motion.a>
  );
}

function FeatureOverview() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Everything you need"
        title={
          <>
            A complete trading workspace,{" "}
            <span className="text-muted-foreground">without the tool sprawl</span>
          </>
        }
        description="Stop stitching together five apps. Replay, journal, analytics and coaching live in one professional cockpit."
      />

      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Primary tile — replay engine with live product surface */}
        <BentoTile href="#replay" className="md:col-span-8" delay={0}>
          <div className="relative z-10">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Film className="h-6 w-6" />
            </div>
            <h3 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Advanced backtesting engine
            </h3>
            <p className="mt-2 max-w-md text-muted-foreground">
              Replay historical market data with tick-level precision. Practise every order type in
              a risk-free environment, at any speed.
            </p>
          </div>
          <div className="relative mt-8">
            <HeroMockup />
          </div>
        </BentoTile>

        {/* AI coach */}
        <BentoTile href="#ai" className="flex flex-col justify-between md:col-span-4" delay={1}>
          <div>
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Brain className="h-6 w-6" />
            </div>
            <h3 className="font-display text-2xl font-bold tracking-tight">AI Coach</h3>
            <p className="mt-2 text-muted-foreground">
              Real-time analysis of your execution, psychology and repeating patterns — with a
              roadmap built from your own data.
            </p>
          </div>
          <div className="mt-8 border-t border-border/50 pt-6 text-sm font-semibold text-primary">
            <span className="inline-flex items-center gap-1 transition-all group-hover:gap-2">
              Ask AI to review a trade <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </BentoTile>

        {/* Analytics — wide secondary */}
        <BentoTile href="#analytics" className="md:col-span-12 lg:col-span-12" delay={2}>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">
                Institutional-grade analytics
              </h3>
              <p className="mt-2 max-w-md text-muted-foreground">
                Expectancy, Sharpe, Sortino, drawdown, session heatmaps and strategy-level
                breakdowns — computed on every trade you log.
              </p>
            </div>
            <div className="flex h-40 items-end gap-2 rounded-2xl border border-border/50 bg-background/60 p-4">
              {[22, 38, 31, 56, 47, 72, 63, 90].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t bg-primary/70 transition-all duration-500 group-hover:bg-primary"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </BentoTile>

        {/* Bottom trio */}
        {BENTO_SMALL.map((f, i) => (
          <BentoTile key={f.title} href={f.href} className="md:col-span-4" delay={i + 3}>
            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-xl font-bold tracking-tight">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
          </BentoTile>
        ))}
      </div>
    </Section>
  );
}

/* ================================================================== */
/* Showcase blocks                                                      */
/* ================================================================== */

function Showcase({
  id,
  eyebrow,
  title,
  description,
  bullets,
  reverse,
  visual,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  bullets: { icon: typeof Zap; label: string }[];
  reverse?: boolean;
  visual: ReactNode;
}) {
  return (
    <Section id={id}>
      <div
        className={cn(
          "grid items-center gap-12 lg:gap-16",
          reverse ? "lg:grid-cols-[1fr_1.1fr]" : "lg:grid-cols-[1.1fr_1fr]",
        )}
      >
        <div className={cn(reverse && "lg:order-2")}>
          <EyebrowBadge icon={Sparkles}>{eyebrow}</EyebrowBadge>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {title}
          </h2>
          <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {description}
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {bullets.map((b) => (
              <li key={b.label} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <b.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-muted-foreground">{b.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className={cn("relative", reverse && "lg:order-1")}
        >
          {visual}
        </motion.div>
      </div>
    </Section>
  );
}

function MockPanel({ children, title, tag }: { children: ReactNode; title: string; tag?: string }) {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-primary/25 via-info/15 to-success/15 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2.5">
          <div className="text-xs font-medium text-foreground">{title}</div>
          {tag ? (
            <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {tag}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function ReplayShowcase() {
  return (
    <Showcase
      id="replay"
      eyebrow="Replay Studio"
      title={
        <>
          Rewind the market.{" "}
          <span className="bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
            Practice like a pro.
          </span>
        </>
      }
      description="Load any symbol, jump to any date, and step through the market bar by bar. Save sessions, replay your own trades and turn hindsight into skill."
      bullets={[
        { icon: Zap, label: "Instant setup with Surprise-Me dates" },
        { icon: Clock, label: "Full historical replay across FX, crypto, stocks" },
        { icon: Gauge, label: "Professional playback controls & speed" },
        { icon: Rocket, label: "One-click backtesting and saved sessions" },
      ]}
      visual={
        <MockPanel title="Replay Studio · EURUSD" tag="Backtest">
          <div className="aspect-[16/10] bg-gradient-to-br from-background to-muted/30 p-4">
            <MockChart />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <button className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                <Play className="h-4 w-4" />
              </button>
              <div className="text-xs">
                <div className="font-medium">Playing · 2× speed</div>
                <div className="text-muted-foreground">Bar 342 / 5,120</div>
              </div>
            </div>
            <div className="hidden gap-2 sm:flex">
              {["1x", "2x", "5x", "10x"].map((s) => (
                <span
                  key={s}
                  className={cn(
                    "rounded-md border border-border/60 px-2 py-1 text-[10px] font-mono",
                    s === "2x" ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </MockPanel>
      }
    />
  );
}

function AICoachShowcase() {
  return (
    <Showcase
      id="ai"
      reverse
      eyebrow="AI Trading Coach"
      title={<>Your personal mentor, trained on your trades.</>}
      description="Every replay, journal entry and paper trade feeds a private coaching model that spots your leaks, celebrates your edges and builds a personalised improvement roadmap."
      bullets={[
        { icon: Brain, label: "Behavioural analysis (FOMO, revenge, tilt)" },
        { icon: TrendingUp, label: "Ranked strengths & weaknesses" },
        { icon: Compass, label: "Weekly reports & focused roadmap" },
        { icon: Shield, label: "Evidence-based, never generic advice" },
      ]}
      visual={
        <MockPanel title="AI Coach · Weekly Report" tag="Beta">
          <div className="space-y-3 p-5">
            {[
              {
                tag: "Strength",
                title: "London open discipline",
                body: "You waited for confirmation on 9/11 setups this week.",
                tone: "success" as const,
              },
              {
                tag: "Leak",
                title: "Stops moved 4 times",
                body: "Trades where SL was widened produced −1.7R on average.",
                tone: "danger" as const,
              },
              {
                tag: "Focus",
                title: "Cut trading after 8 PM UTC",
                body: "82% of losses this month came from late US session.",
                tone: "warning" as const,
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-xl border border-border/60 bg-background/60 p-4"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5",
                      c.tone === "success" && "bg-success/15 text-success",
                      c.tone === "danger" && "bg-danger/15 text-danger",
                      c.tone === "warning" && "bg-warning/15 text-warning",
                    )}
                  >
                    {c.tag}
                  </span>
                </div>
                <div className="mt-1.5 text-sm font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.body}</div>
              </div>
            ))}
          </div>
        </MockPanel>
      }
    />
  );
}

function AnalyticsShowcase() {
  const barsWin = [42, 58, 61, 49, 63, 71, 55, 66, 74, 68, 72, 80];
  return (
    <Showcase
      id="analytics"
      eyebrow="Performance Analytics"
      title={<>Institution-grade insight. Zero spreadsheets.</>}
      description="Equity curves with drawdown overlays, session and strategy breakdowns, risk consistency, mistake clustering — every metric a serious desk expects."
      bullets={[
        { icon: LineChart, label: "Equity curve with drawdown overlay" },
        { icon: BarChart3, label: "Session & strategy heatmaps" },
        { icon: Target, label: "Sharpe, Sortino, profit factor, RR" },
        { icon: Shield, label: "Risk & consistency scoring" },
      ]}
      visual={
        <MockPanel title="Analytics · Last 30 days" tag="Live">
          <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
            {[
              { l: "Win rate", v: "58.4%", up: true },
              { l: "Profit factor", v: "2.14", up: true },
              { l: "Max DD", v: "−4.2%", up: false },
            ].map((k) => (
              <div key={k.l} className="p-4">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {k.l}
                </div>
                <div
                  className={cn(
                    "mt-1 text-xl font-semibold tabular-nums",
                    k.up ? "text-success" : "text-danger",
                  )}
                >
                  {k.v}
                </div>
              </div>
            ))}
          </div>
          <div className="aspect-[16/8] p-4">
            <MockChart />
          </div>
          <div className="border-t border-border/60 p-4">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Win rate by month</span>
              <span>%</span>
            </div>
            <div className="flex items-end gap-1.5 h-20">
              {barsWin.map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${v}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: i * 0.03 }}
                  className="flex-1 rounded-sm bg-gradient-to-t from-primary/50 to-primary"
                />
              ))}
            </div>
          </div>
        </MockPanel>
      }
    />
  );
}

function WorkspaceShowcase() {
  return (
    <Section id="workspace">
      <SectionHeading
        eyebrow="Trading Workspace"
        title={
          <>
            The chart is the hero.{" "}
            <span className="text-muted-foreground">Everything else gets out of the way.</span>
          </>
        }
        description="Focus Mode, floating replay overlay, tabbed side panel and up to 80% chart real-estate — a professional cockpit designed for deep work."
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="mt-16"
      >
        <MockPanel title="Trading Workspace · Focus Mode" tag="F">
          <div className="relative aspect-[21/10] bg-gradient-to-br from-background to-muted/30 p-4">
            <MockChart />
            <FloatingCard className="absolute left-4 top-4" tone="up">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Risk / Reward
              </div>
              <div className="text-lg font-semibold">1 : 2.6</div>
              <div className="text-[10px] text-success/80">+2.6R at TP</div>
            </FloatingCard>
            <FloatingCard className="absolute bottom-4 left-4" tone="neutral">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Risk</div>
              <div className="text-lg font-semibold">0.5%</div>
              <div className="text-[10px] text-muted-foreground">$50 · 0.12 lots</div>
            </FloatingCard>
            <FloatingCard className="absolute right-4 top-4" tone="down">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Open PnL
              </div>
              <div className="text-lg font-semibold text-danger">−$18.20</div>
              <div className="text-[10px] text-danger/80">−0.36R</div>
            </FloatingCard>
          </div>
        </MockPanel>
      </motion.div>
    </Section>
  );
}

/* ================================================================== */
/* Comparison                                                           */
/* ================================================================== */

function Comparison() {
  const rows = [
    { l: "Market replay & backtesting", a: false, b: true },
    { l: "Auto-populated trade journal", a: false, b: true },
    { l: "Sharpe, Sortino, drawdown analytics", a: false, b: true },
    { l: "Personal AI coach on your data", a: false, b: true },
    { l: "Realistic paper trading engine", a: false, b: true },
    { l: "Professional trade review workflow", a: false, b: true },
    { l: "Saved sessions & workspace prefs", a: false, b: true },
  ];
  return (
    <Section id="why">
      <SectionHeading
        eyebrow="Why TradersHIVE"
        title={<>The traditional journal, upgraded to a full trading OS.</>}
        description="A side-by-side of what serious traders actually need — versus what most journals still ship in 2026."
      />

      <div className="mt-16 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/40 p-6 backdrop-blur">
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Traditional journal
          </div>
          <div className="mb-5 text-xl font-semibold">Legacy trade log</div>
          <ul className="space-y-3 text-sm">
            {rows.map((r) => (
              <li key={r.l} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-muted text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                </span>
                <span className="text-muted-foreground">{r.l}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-background/60 to-background/40 p-6 shadow-xl shadow-primary/10 backdrop-blur">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {APP_NAME}
          </div>
          <div className="mb-5 text-xl font-semibold">The trading OS</div>
          <ul className="space-y-3 text-sm">
            {rows.map((r) => (
              <li key={r.l} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-success/15 text-success">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>{r.l}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/* Beta section                                                         */
/* ================================================================== */

function BetaSection() {
  const benefits = [
    { icon: Zap, title: "Priority support", desc: "Direct line to the founding team." },
    { icon: Rocket, title: "Early access", desc: "First to try every new module." },
    { icon: Compass, title: "Shape the roadmap", desc: "Your feedback becomes the product." },
    { icon: Shield, title: "Lifetime discount", desc: "Locked-in pricing at launch." },
  ];
  return (
    <Section id="pricing">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-background/60 via-background/40 to-background/60 p-8 backdrop-blur-xl sm:p-12">
        <div className="absolute -top-40 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <EyebrowBadge icon={Sparkles}>Closed Beta · Free while it lasts</EyebrowBadge>
            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Join a small circle of serious traders shaping{" "}
              <span className="bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
                the platform
              </span>
              .
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Access is limited while we polish every corner. Every beta trader gets founder-level
              support and a lifetime discount when pricing launches.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full px-6 shadow-xl shadow-primary/25"
              >
                <Link to="/register">
                  Join Closed Beta <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-border/70 bg-background/50 px-6"
              >
                <a href="#faq">
                  <MessageCircle className="mr-2 h-4 w-4" /> Have questions?
                </a>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-border/60 bg-background/60 p-5 backdrop-blur"
              >
                <b.icon className="mb-3 h-5 w-5 text-primary" />
                <div className="text-sm font-semibold">{b.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/* Roadmap                                                              */
/* ================================================================== */

type RoadmapStatus = "done" | "now" | "next";
const ROADMAP: { status: RoadmapStatus; title: string; desc: string }[] = [
  {
    status: "done",
    title: "Replay Studio",
    desc: "Full historical replay across FX, crypto, stocks.",
  },
  { status: "done", title: "Trading Workspace", desc: "Professional charting with Focus Mode." },
  { status: "done", title: "AI Trading Coach", desc: "Personal mentor trained on your trades." },
  { status: "done", title: "Performance Analytics", desc: "Institution-grade metrics dashboard." },
  {
    status: "now",
    title: "Community & Guilds",
    desc: "Share setups, follow traders, join guilds.",
  },
  {
    status: "next",
    title: "Billing & Pricing",
    desc: "Founding-member tiers and lifetime discounts.",
  },
  { status: "next", title: "Mobile App", desc: "Journal on the go, coach in your pocket." },
];

function Roadmap() {
  const map: Record<RoadmapStatus, { label: string; tone: string }> = {
    done: { label: "Shipped", tone: "bg-success/15 text-success" },
    now: { label: "In progress", tone: "bg-primary/15 text-primary" },
    next: { label: "Coming soon", tone: "bg-muted text-muted-foreground" },
  };
  return (
    <Section id="roadmap">
      <SectionHeading
        eyebrow="Roadmap"
        title={<>Built in the open. Shipped every week.</>}
        description="A living roadmap you can influence directly as a beta member."
      />
      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ROADMAP.map((r, i) => (
          <motion.div
            key={r.title}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            custom={i}
            className="group rounded-2xl border border-border/60 bg-background/50 p-6 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/40"
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                  map[r.status].tone,
                )}
              >
                {map[r.status].label}
              </span>
              {r.status === "done" ? (
                <Check className="h-4 w-4 text-success" />
              ) : r.status === "now" ? (
                <Cpu className="h-4 w-4 text-primary" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="mt-4 text-lg font-semibold tracking-tight">{r.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{r.desc}</div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ================================================================== */
/* FAQ                                                                  */
/* ================================================================== */

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is TradersHIVE?",
    a: "TradersHIVE is a professional trading workspace that combines market replay, an auto-populated trading journal, institution-grade analytics and a personal AI coach — all in one place.",
  },
  {
    q: "Who is it for?",
    a: "Serious retail and prop-firm traders who want to review, backtest and improve systematically. If you're stitching together TradingView, a spreadsheet and a notebook — this is for you.",
  },
  {
    q: "Which markets do you support?",
    a: "Forex, crypto (via Binance), major indices, commodities and stocks (via Twelve Data). More venues are on the roadmap.",
  },
  {
    q: "How does Replay Studio work?",
    a: "Pick any symbol and any date, and the Studio streams bars back to you at whatever speed you like. Practice setups, journal trades and save the session to continue later.",
  },
  {
    q: "Is the AI Coach a chatbot?",
    a: "No. It's a private intelligence engine that reads your actual trades, journals and mistakes, then generates evidence-based reports, strengths, weaknesses and a personalised roadmap.",
  },
  {
    q: "When will pricing launch?",
    a: "During the closed beta the platform is completely free. Pricing tiers will launch after public release — and every beta member gets a lifetime discount.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your trades, journals and coaching data belong to you. RLS is enforced at the database layer and we never sell or share your data.",
  },
];

function FAQ() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow="FAQ" title="Answers to the questions traders actually ask." />
      <div className="mx-auto mt-12 max-w-3xl">
        <Accordion type="single" collapsible className="w-full space-y-3">
          {FAQS.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`item-${i}`}
              className="overflow-hidden rounded-2xl border border-border/60 bg-background/50 px-5 backdrop-blur"
            >
              <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">
                <span className="flex items-center gap-3">
                  <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-data-[state=open]:rotate-180" />
                  {f.q}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}

/* ================================================================== */
/* Final CTA                                                            */
/* ================================================================== */

function FinalCTA() {
  return (
    <Section className="!pt-16">
      <div className="relative overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-primary/15 via-background/60 to-background/40 px-6 py-16 text-center backdrop-blur-xl sm:px-12 sm:py-24">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative mx-auto max-w-3xl">
          <EyebrowBadge icon={Sparkles}>Ready when you are</EyebrowBadge>
          <h2 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Ready to level up your trading?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Join the closed beta today. Free while it lasts, lifetime discount when we launch.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full px-6 shadow-xl shadow-primary/25"
            >
              <Link to="/register">
                Join Closed Beta <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-full border-border/70 bg-background/50 px-6"
            >
              <a href="#replay">
                <Video className="mr-2 h-4 w-4" /> Watch Demo
              </a>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/* Footer                                                               */
/* ================================================================== */

function Footer() {
  const cols: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Replay Studio", href: "#replay" },
        { label: "AI Coach", href: "#ai" },
        { label: "Analytics", href: "#analytics" },
        { label: "Roadmap", href: "#roadmap" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Contact", href: "mailto:hello@tradershive.com", external: true },
        { label: "FAQ", href: "#faq" },
        { label: "Join Beta", href: "/register" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
    },
  ];
  return (
    <footer className="relative z-10 mt-16 border-t border-border/60 bg-background/60 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <Link to="/" className="inline-flex items-center gap-2" aria-label={APP_NAME}>
              <LogoMark />
              <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              The professional trader's workspace — replay, journal, analyse and coach, all in one.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {[
                { icon: Twitter, href: "https://twitter.com", label: "Twitter / X" },
                { icon: MessageCircle, href: "https://discord.com", label: "Discord" },
                { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
                { icon: Github, href: "https://github.com", label: "GitHub" },
                { icon: Mail, href: "mailto:hello@tradershive.com", label: "Email" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {c.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external || l.href.startsWith("#") || l.href.startsWith("mailto:") ? (
                      <a
                        href={l.href}
                        className="text-sm text-muted-foreground transition hover:text-foreground"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        to={l.href}
                        className="text-sm text-muted-foreground transition hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div>
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5" /> Built for serious traders
            </span>
            <Badge variant="outline" className="border-border/60 font-normal">
              v2.0 · Closed Beta
            </Badge>
          </div>
        </div>
      </div>
    </footer>
  );
}
