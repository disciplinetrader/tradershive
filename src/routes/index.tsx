import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Coins,
  Flame,
  Gamepad2,
  LineChart,
  Menu,
  Play,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/use-auth";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TradersHIVE Arena — Train. Trade. Compete." },
      {
        name: "description",
        content:
          "The gamified arena for serious traders. Risk-free paper trading, an automated journal, daily challenges, XP, leagues and global leaderboards — everything you need to become consistently profitable.",
      },
      { property: "og:title", content: "TradersHIVE Arena — Train. Trade. Compete." },
      {
        property: "og:description",
        content:
          "The gamified arena for serious traders. Risk-free paper trading, an automated journal, daily challenges, XP, leagues and global leaderboards — everything you need to become consistently profitable.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "TradersHIVE Arena — Train. Trade. Compete." },
      {
        name: "twitter:description",
        content:
          "The gamified arena for serious traders. Risk-free paper trading, an automated journal, daily challenges, XP, leagues and global leaderboards — everything you need to become consistently profitable.",
      },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "TradersHIVE Arena",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "Gamified paper trading, journaling, challenges and leaderboards for serious traders.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: LandingPage,
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <AmbientBackground />
      <Navbar />
      <main>
        <Hero />
        <SocialProof />
        <WhySection />
        <HowItWorks />
        <FeatureShowcase />
        <GamificationSection />
        <CommunitySection />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ambient background                                                  */
/* ------------------------------------------------------------------ */

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-[0.35]" />
      <div className="absolute inset-x-0 top-0 h-[820px] gradient-radial-glow opacity-90" />
      <div className="absolute -left-40 top-[18%] h-[420px] w-[420px] rounded-full bg-primary/20 blur-[140px] animate-float" />
      <div
        className="absolute right-[-10%] top-[45%] h-[520px] w-[520px] rounded-full bg-info/15 blur-[160px] animate-float"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute left-1/3 bottom-[10%] h-[380px] w-[380px] rounded-full bg-primary-glow/10 blur-[140px] animate-float"
        style={{ animationDelay: "4s" }}
      />
      <Particles />
    </div>
  );
}

function Particles() {
  // Deterministic pseudo-random positions so SSR/CSR match.
  const particles = Array.from({ length: 28 }, (_, i) => {
    const x = ((i * 97) % 100) + ((i * 13) % 7) / 10;
    const y = ((i * 53) % 100) + ((i * 7) % 9) / 10;
    const size = 1 + (i % 3);
    const delay = (i % 10) * 0.4;
    const duration = 6 + (i % 6);
    return { x, y, size, delay, duration, id: i };
  });
  return (
    <div className="absolute inset-0">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full bg-primary/40"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{ y: [0, -30, 0], opacity: [0.15, 0.7, 0.15] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navbar                                                              */
/* ------------------------------------------------------------------ */

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Arena", href: "#arena" },
  { label: "Challenges", href: "#challenges" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Blog", href: "#blog", soon: true },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border/60 bg-background/70 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 group" aria-label={APP_NAME}>
          <LogoMark />
          <span className="text-sm font-bold tracking-tight sm:text-base">{APP_NAME}</span>
        </Link>

        <nav
          className="hidden items-center gap-8 text-sm text-muted-foreground lg:flex"
          aria-label="Primary"
        >
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="relative inline-flex items-center gap-1.5 transition hover:text-foreground"
            >
              {l.label}
              {l.soon && (
                <span className="rounded-full border border-border bg-surface/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Soon
                </span>
              )}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Login</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="gradient-primary text-primary-foreground shadow-elegant"
          >
            <Link to="/auth" search={{ mode: "register" }}>
              Get Started
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface/60 text-foreground lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-border/60 bg-background/95 backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-sm text-foreground/90 hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                {l.label}
                {l.soon && (
                  <span className="rounded-full border border-border bg-surface/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Soon
                  </span>
                )}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="glass">
                <Link to="/auth">Login</Link>
              </Button>
              <Button asChild className="gradient-primary text-primary-foreground">
                <Link to="/auth" search={{ mode: "register" }}>
                  Get Started
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <section ref={ref} className="relative z-10 mx-auto max-w-7xl px-4 pt-14 pb-24 sm:px-6 md:pt-20 lg:px-8 lg:pt-24">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]"
      >
        <div className="text-center lg:text-left">
          <motion.div variants={fadeUp}>
            <Badge
              variant="outline"
              className="inline-flex items-center gap-2 border-border/60 bg-surface/60 px-3 py-1 text-xs backdrop-blur"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Season 1 · Now live
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-6 text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-[68px]"
          >
            Become the <span className="text-gradient">Trader</span> You Always Wanted to Be.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg lg:mx-0"
          >
            Practice with realistic paper trading, complete daily challenges, improve through
            journaling, climb global leaderboards and become consistently profitable.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <Button
              asChild
              size="lg"
              className="gradient-primary text-primary-foreground shadow-elegant"
            >
              <Link to="/auth" search={{ mode: "register" }}>
                <Zap className="mr-2 h-4 w-4" />
                Start Free
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="glass gap-2"
              disabled
              aria-label="Watch demo, coming soon"
            >
              <Play className="h-4 w-4" />
              Watch Demo
              <span className="ml-1 rounded-full border border-border bg-surface/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Soon
              </span>
            </Button>
          </motion.div>

          <motion.ul
            variants={fadeUp}
            className="mx-auto mt-8 flex max-w-md flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs uppercase tracking-widest text-muted-foreground lg:mx-0 lg:justify-start"
          >
            <li className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" /> Zero risk
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" /> Real market data
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" /> Free forever
            </li>
          </motion.ul>
        </div>

        <motion.div style={{ y }} variants={fadeUp} className="relative">
          <HeroDashboard />
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Hero dashboard mockup                                               */
/* ------------------------------------------------------------------ */

function HeroDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[36px] bg-gradient-to-br from-primary/20 via-info/10 to-transparent blur-2xl" />
      <div className="relative rounded-3xl border border-border bg-surface/70 p-3 shadow-elegant backdrop-blur-xl">
        <div className="rounded-2xl bg-gradient-to-br from-surface to-background p-4 sm:p-5">
          {/* Top bar */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/80" />
              <span className="ml-2 font-mono text-[11px]">arena / dashboard</span>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Live
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Equity" value="$128,420" delta="+4.2%" positive />
            <MiniStat label="Win Rate" value="61%" delta="+2.1%" positive />
            <MiniStat label="Level" value="Lv 24" delta="Gold II" positive />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Equity Curve
                  </p>
                  <p className="mt-0.5 font-mono text-sm text-foreground">30d · +$8,240</p>
                </div>
                <span className="text-xs font-semibold text-primary">+6.85%</span>
              </div>
              <div className="mt-3 h-40">
                <EquityCurve />
              </div>
            </div>
            <div className="space-y-3">
              <XPWidget />
              <ChallengeWidget />
            </div>
          </div>

          <div className="mt-3 glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Recent Trades
              </p>
              <span className="text-[11px] text-muted-foreground">Today</span>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {[
                { sym: "BTCUSD", side: "LONG", pnl: "+$412.30", pct: "+1.24%", pos: true },
                { sym: "EURUSD", side: "SHORT", pnl: "+$186.50", pct: "+0.48%", pos: true },
                { sym: "NAS100", side: "LONG", pnl: "-$92.10", pct: "-0.21%", pos: false },
              ].map((t) => (
                <li key={t.sym} className="flex items-center justify-between py-2 text-xs">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-foreground">{t.sym}</span>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        t.side === "LONG"
                          ? "bg-primary/15 text-primary"
                          : "bg-info/15 text-info",
                      )}
                    >
                      {t.side}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className={t.pos ? "text-primary" : "text-danger"}>{t.pnl}</span>
                    <span className="text-muted-foreground">{t.pct}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Floating cards */}
      <motion.div
        className="absolute -left-4 top-24 hidden rounded-2xl border border-border bg-surface/90 p-3 shadow-elegant backdrop-blur-xl sm:block"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
            <Flame className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Streak</p>
            <p className="text-sm font-semibold">7 days</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute -right-3 bottom-16 hidden rounded-2xl border border-border bg-surface/90 p-3 shadow-elegant backdrop-blur-xl sm:block"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-warning/15 text-warning">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Rank</p>
            <p className="text-sm font-semibold">#128 Global</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-3.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-lg font-semibold">{value}</span>
        <span className={cn("text-[11px] font-semibold", positive ? "text-primary" : "text-danger")}>
          {delta}
        </span>
      </div>
    </div>
  );
}

function XPWidget() {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between text-xs">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Current XP</p>
        <span className="font-mono text-[11px] text-muted-foreground">2,840 / 3,600</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: "78%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="h-full gradient-primary"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Level 24</span>
        <span className="text-primary">760 XP to next</span>
      </div>
    </div>
  );
}

function ChallengeWidget() {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Today's Challenge
        </p>
        <Target className="h-3.5 w-3.5 text-primary" />
      </div>
      <p className="mt-1.5 text-sm font-semibold">3 A+ setups journaled</p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Progress</span>
        <span className="font-mono">2 / 3</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: "66%" }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.2 }}
          className="h-full gradient-primary"
        />
      </div>
    </div>
  );
}

function EquityCurve() {
  const points = [
    12, 18, 16, 22, 26, 24, 30, 28, 35, 33, 40, 38, 46, 44, 52, 50, 58, 55, 64, 62, 70, 68, 76,
    74, 82, 80, 88, 84, 92, 90,
  ];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((p - min) / (max - min || 1)) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="equityGlow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${path} L100,100 L0,100 Z`}
        fill="url(#equityGlow)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.path
        d={path}
        stroke="var(--primary)"
        strokeWidth="1.4"
        fill="none"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Social proof                                                        */
/* ------------------------------------------------------------------ */

function SocialProof() {
  const stats = [
    { label: "Members", value: 24380, suffix: "+" },
    { label: "Trades Practiced", value: 1240000, suffix: "+", format: "compact" as const },
    { label: "Challenges Completed", value: 186420, suffix: "+" },
    { label: "Countries", value: 92, suffix: "" },
  ];
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
          >
            <GlassCard className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-2 font-mono text-3xl font-bold text-gradient sm:text-4xl">
                <Counter to={s.value} format={s.format} />
                {s.suffix}
              </p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Counter({ to, format }: { to: number; format?: "compact" }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started) {
            started = true;
            const start = performance.now();
            const dur = 1600;
            const step = (t: number) => {
              const p = Math.min(1, (t - start) / dur);
              const eased = 1 - Math.pow(1 - p, 3);
              setN(Math.round(to * eased));
              if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  const display =
    format === "compact"
      ? n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(2)}M`
        : n >= 1_000
          ? `${(n / 1_000).toFixed(1)}K`
          : `${n}`
      : n.toLocaleString();

  return <span ref={ref}>{display}</span>;
}

/* ------------------------------------------------------------------ */
/* Why TradersHIVE                                                     */
/* ------------------------------------------------------------------ */

function WhySection() {
  const features = [
    {
      icon: LineChart,
      title: "Practice Trading",
      desc: "Trade risk-free with realistic paper trading on real market data, spreads and slippage.",
    },
    {
      icon: BookOpen,
      title: "Trading Journal",
      desc: "Every trade is journaled automatically with entries, exits, R-multiples and screenshots.",
    },
    {
      icon: Target,
      title: "Daily Challenges",
      desc: "Improve discipline every day with focused missions built around real trader habits.",
    },
    {
      icon: BarChart3,
      title: "Statistics",
      desc: "Professional analytics on edge, expectancy, drawdown, win-rate and consistency.",
    },
    {
      icon: Trophy,
      title: "Leaderboards",
      desc: "Compete globally across regions and leagues from Bronze all the way to Grandmaster.",
    },
    {
      icon: Sparkles,
      title: "XP System",
      desc: "Gamified progression that turns deliberate practice into levels, streaks and rewards.",
    },
  ];
  return (
    <section id="features" className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Why TradersHIVE"
        title="Everything a serious trader needs, in one arena."
        subtitle="Deliberate practice, measurable growth, and a community that pushes you to level up."
      />
      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: (i % 3) * 0.06 }}
          >
            <GlassCard className="group hover-lift h-full p-6">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-elegant transition group-hover:bg-primary/15">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  center = true,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("mx-auto max-w-2xl", center && "text-center")}>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-bold sm:text-4xl md:text-5xl">{title}</h2>
      {subtitle && (
        <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">{subtitle}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Create Account",
      desc: "Sign up in seconds and land in your personal arena dashboard.",
      icon: Shield,
    },
    {
      n: "02",
      title: "Practice Trading",
      desc: "Open your first paper trades on live markets with zero risk.",
      icon: LineChart,
    },
    {
      n: "03",
      title: "Review Journal",
      desc: "Turn every trade into a lesson with tags, notes and analytics.",
      icon: BookOpen,
    },
    {
      n: "04",
      title: "Become Consistent",
      desc: "Complete challenges, climb leagues and forge a repeatable edge.",
      icon: Trophy,
    },
  ];
  return (
    <section id="arena" className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="How It Works"
        title="From first trade to consistent edge."
        subtitle="A clear path from complete beginner to disciplined, data-driven trader."
      />
      <div className="relative mt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/40 to-transparent lg:block"
        />
        <ol className="grid gap-6 lg:grid-cols-2">
          {steps.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, delay: i * 0.08 }}
              className={cn(
                "relative",
                i % 2 === 1 && "lg:mt-16",
              )}
            >
              <GlassCard className="p-6 md:p-7">
                <div className="flex items-start gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-elegant">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-widest text-primary">
                      Step {s.n}
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">{s.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              </GlassCard>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Feature showcase — alternating                                      */
/* ------------------------------------------------------------------ */

function FeatureShowcase() {
  const items: {
    tag: string;
    title: string;
    desc: string;
    bullets: string[];
    mock: ReactNode;
  }[] = [
    {
      tag: "Paper Trading",
      title: "A TradingView-grade arena, fully paper.",
      desc: "Professional charts, real spreads, market and limit orders — practice like the pros without risking a cent.",
      bullets: ["Live market data", "Market · Limit · Stop orders", "Position + P&L tracking"],
      mock: <ChartMock />,
    },
    {
      tag: "Trading Journal",
      title: "A journal that writes itself.",
      desc: "Every fill is captured with entry, exit, R-multiple, tags and screenshots — searchable in seconds.",
      bullets: ["Auto-imported trades", "Tags, notes, screenshots", "Setup + mistake analytics"],
      mock: <JournalMock />,
    },
    {
      tag: "Statistics",
      title: "See your edge in one glance.",
      desc: "Deep analytics on expectancy, drawdown, consistency and behavior — the metrics prop firms actually care about.",
      bullets: ["Equity + drawdown", "By-setup win-rate", "Discipline score"],
      mock: <StatsMock />,
    },
    {
      tag: "Challenges",
      title: "Missions built around real trader habits.",
      desc: "Daily and weekly challenges shape discipline, risk management and journaling into muscle memory.",
      bullets: ["Daily missions", "Weekly objectives", "Prop-firm scoring"],
      mock: <ChallengeMock />,
    },
  ];
  return (
    <section id="challenges" className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Feature Showcase"
        title="Built for traders who are done losing."
      />
      <div className="mt-16 space-y-24">
        {items.map((it, i) => (
          <div
            key={it.title}
            className={cn(
              "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
              i % 2 === 1 && "lg:[&>div:first-child]:order-2",
            )}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                {it.tag}
              </span>
              <h3 className="mt-4 text-3xl font-bold sm:text-4xl">{it.title}</h3>
              <p className="mt-3 text-muted-foreground sm:text-lg">{it.desc}</p>
              <ul className="mt-6 space-y-2 text-sm">
                {it.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-foreground/90">
                    <Check className="h-4 w-4 text-primary" />
                    {b}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7 }}
              className="relative"
            >
              <div className="absolute -inset-6 rounded-[36px] bg-gradient-to-br from-primary/20 via-info/10 to-transparent blur-2xl" />
              <div className="relative rounded-3xl border border-border bg-surface/70 p-3 shadow-elegant backdrop-blur-xl">
                <div className="rounded-2xl bg-gradient-to-br from-surface to-background p-4">
                  {it.mock}
                </div>
              </div>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartMock() {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
            BTCUSD
          </span>
          <span className="font-mono text-muted-foreground">1H · Bybit</span>
        </div>
        <span className="font-mono text-primary">$68,412.30 +2.48%</span>
      </div>
      <div className="mt-3 h-52">
        <Candles />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        {[
          { l: "Bid", v: "68,410.10" },
          { l: "Ask", v: "68,414.50" },
          { l: "Spread", v: "0.006%" },
        ].map((x) => (
          <div key={x.l} className="glass rounded-xl p-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{x.l}</p>
            <p className="font-mono text-sm">{x.v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Candles() {
  const candles = [
    [10, 22, 8, 20],
    [20, 30, 18, 24],
    [24, 28, 20, 22],
    [22, 26, 16, 18],
    [18, 34, 16, 32],
    [32, 40, 28, 36],
    [36, 44, 30, 34],
    [34, 42, 32, 40],
    [40, 46, 34, 36],
    [36, 50, 34, 48],
    [48, 56, 44, 50],
    [50, 54, 40, 44],
    [44, 60, 42, 58],
    [58, 66, 54, 62],
    [62, 68, 56, 60],
    [60, 74, 58, 72],
    [72, 78, 66, 68],
    [68, 82, 64, 80],
    [80, 86, 74, 78],
    [78, 90, 76, 88],
  ];
  const flat = candles.flat();
  const max = Math.max(...flat);
  const min = Math.min(...flat);
  const scale = (v: number) => 100 - ((v - min) / (max - min)) * 100;
  const w = 100 / candles.length;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      {candles.map(([o, h, l, c], i) => {
        const up = c >= o;
        const x = i * w + w / 2;
        return (
          <g key={i}>
            <line
              x1={x}
              x2={x}
              y1={scale(h)}
              y2={scale(l)}
              stroke={up ? "var(--primary)" : "var(--danger)"}
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={x - w * 0.3}
              y={scale(Math.max(o, c))}
              width={w * 0.6}
              height={Math.max(0.6, Math.abs(scale(o) - scale(c)))}
              fill={up ? "var(--primary)" : "var(--danger)"}
              opacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}

function JournalMock() {
  const rows = [
    { pair: "BTCUSD", side: "LONG", setup: "Breakout", r: "+2.4R", pnl: "+$612", pos: true },
    { pair: "EURUSD", side: "SHORT", setup: "Fakeout", r: "+1.6R", pnl: "+$188", pos: true },
    { pair: "GOLD", side: "LONG", setup: "Trend pullback", r: "-1R", pnl: "-$120", pos: false },
    { pair: "NAS100", side: "LONG", setup: "Opening drive", r: "+3.1R", pnl: "+$942", pos: true },
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Journal</p>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          This week
        </span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface/60 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Pair</th>
              <th className="px-3 py-2 text-left font-medium">Setup</th>
              <th className="px-3 py-2 text-right font-medium">R</th>
              <th className="px-3 py-2 text-right font-medium">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pair} className="border-t border-border">
                <td className="px-3 py-2 font-mono">
                  <div className="flex items-center gap-2">
                    {r.pair}
                    <span
                      className={cn(
                        "rounded px-1 text-[10px] font-semibold",
                        r.side === "LONG"
                          ? "bg-primary/15 text-primary"
                          : "bg-info/15 text-info",
                      )}
                    >
                      {r.side}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.setup}</td>
                <td className="px-3 py-2 text-right font-mono">{r.r}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono",
                    r.pos ? "text-primary" : "text-danger",
                  )}
                >
                  {r.pnl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatsMock() {
  const stats = [
    { l: "Expectancy", v: "0.82R" },
    { l: "Win rate", v: "61%" },
    { l: "Avg R", v: "1.42" },
    { l: "Max DD", v: "-6.4%" },
  ];
  const bars = [40, 62, 55, 78, 48, 82, 70, 64, 88, 74, 60, 92];
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="glass rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</p>
            <p className="mt-1 font-mono text-lg font-semibold">{s.v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-border p-3">
        <div className="flex items-end justify-between gap-1.5" style={{ height: 120 }}>
          {bars.map((b, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              whileInView={{ height: `${b}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.04 }}
              className="w-full rounded-t-md gradient-primary opacity-90"
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-mono text-muted-foreground">
          <span>Jan</span>
          <span>Jun</span>
          <span>Dec</span>
        </div>
      </div>
    </div>
  );
}

function ChallengeMock() {
  const items = [
    { title: "Journal 3 A+ setups", xp: 120, done: true },
    { title: "Keep risk under 1% all day", xp: 200, done: true },
    { title: "No trades in the first 15m", xp: 150, done: false },
    { title: "Close every position before 10pm", xp: 100, done: false },
  ];
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Today's Missions</p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li
            key={it.title}
            className="flex items-center justify-between rounded-xl border border-border bg-surface/60 p-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg",
                  it.done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {it.done ? <Check className="h-4 w-4" /> : <Target className="h-4 w-4" />}
              </div>
              <p
                className={cn(
                  "text-sm",
                  it.done ? "text-foreground line-through opacity-70" : "text-foreground",
                )}
              >
                {it.title}
              </p>
            </div>
            <span className="font-mono text-xs text-primary">+{it.xp} XP</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gamification                                                        */
/* ------------------------------------------------------------------ */

function GamificationSection() {
  const cards = [
    { icon: Zap, title: "XP", value: "2,840", sub: "78% to next level", progress: 78 },
    { icon: Star, title: "Level", value: "Lv 24", sub: "Gold II · Top 12%", progress: 40 },
    { icon: Flame, title: "Daily Streak", value: "7 days", sub: "Elite streak tier", progress: 70 },
    { icon: Award, title: "Achievements", value: "38 / 120", sub: "New: Ice Cold", progress: 32 },
    { icon: Coins, title: "Coins", value: "12,480", sub: "Shop unlocks: 4", progress: 55 },
    { icon: Shield, title: "Badges", value: "16", sub: "Season 1 rewards", progress: 60 },
  ];
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Gamification"
        title="Every rep counts. Every rep is rewarded."
        subtitle="Turn deliberate practice into progression: level up, unlock badges and climb the ranks."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: (i % 3) * 0.06 }}
          >
            <GlassCard className="hover-lift h-full p-6">
              <div className="flex items-start justify-between">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <c.icon className="h-5 w-5" />
                </div>
                <span className="font-mono text-2xl font-bold text-gradient">{c.value}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold">{c.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${c.progress}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full gradient-primary"
                />
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Community                                                           */
/* ------------------------------------------------------------------ */

function CommunitySection() {
  const items = [
    { icon: Users, title: "Guilds", desc: "Team up with traders that share your style and hours." },
    { icon: Swords, title: "Battle Arena", desc: "Head-to-head trading duels with XP and coin stakes." },
    { icon: Sparkles, title: "Friends", desc: "Add mentors and rivals, follow their trades in real time." },
    { icon: Trophy, title: "Leaderboards", desc: "Global, regional and guild boards updated live." },
    { icon: Gamepad2, title: "Profiles", desc: "Show off your stats, badges and season achievements." },
  ];
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Community"
        title="A hive of traders leveling up together."
        subtitle="The social layer is coming — early members get first access."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.06 }}
          >
            <GlassCard className="hover-lift relative h-full overflow-hidden p-6">
              <span className="absolute right-4 top-4 rounded-full border border-border bg-surface/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Coming Soon
              </span>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{it.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{it.desc}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

function PricingSection() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      cadence: "forever",
      desc: "Everything you need to start practicing with intent.",
      features: [
        "Paper trading (spot + FX)",
        "Basic journal & analytics",
        "3 daily challenges",
        "Global leaderboards",
        "Community access",
      ],
      highlight: false,
    },
    {
      name: "Pro",
      price: "$19",
      cadence: "/month",
      desc: "For serious traders building a repeatable edge.",
      features: [
        "Everything in Free",
        "Unlimited challenges",
        "Advanced analytics + drawdown",
        "Screenshots & tag rules",
        "Priority community",
        "Custom XP goals",
      ],
      highlight: true,
    },
    {
      name: "Elite",
      price: "$49",
      cadence: "/month",
      desc: "Prop-firm scoring, coaching and everything unlocked.",
      features: [
        "Everything in Pro",
        "Prop-firm scoring engine",
        "AI trading coach",
        "Season prize pools",
        "Guilds & battle arena access",
        "Early access to new modules",
      ],
      highlight: false,
    },
  ];
  return (
    <section id="pricing" className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="Pricing"
        title="Simple pricing. Serious upside."
        subtitle="Start free forever. Upgrade when you're ready for the full arena."
      />
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {tiers.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: i * 0.06 }}
            className={cn("relative", t.highlight && "lg:-mt-4")}
          >
            {t.highlight && (
              <div className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/40 via-primary-glow/30 to-info/30 blur-lg" />
            )}
            <GlassCard
              className={cn(
                "relative flex h-full flex-col p-7",
                t.highlight && "border-primary/40 shadow-elegant",
              )}
            >
              {t.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{t.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight">{t.price}</span>
                <span className="text-sm text-muted-foreground">{t.cadence}</span>
              </div>
              <Button
                asChild
                className={cn(
                  "mt-6",
                  t.highlight
                    ? "gradient-primary text-primary-foreground shadow-elegant"
                    : "bg-surface text-foreground hover:bg-accent",
                )}
              >
                <Link to="/auth" search={{ mode: "register" }}>
                  Get Started
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <ul className="mt-6 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-foreground/90">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

function FAQSection() {
  const faqs = [
    {
      q: "What is TradersHIVE Arena?",
      a: "TradersHIVE Arena is a gamified training platform for traders. You practice with realistic paper trading on live market data, journal every trade automatically, complete daily challenges and climb global leaderboards — all designed to help you become consistently profitable.",
    },
    {
      q: "Is it real trading?",
      a: "No. All trading inside the arena is paper trading using real live market data. You keep every lesson without risking a single dollar of real capital.",
    },
    {
      q: "Can I connect a broker?",
      a: "Live broker connections are on our roadmap. For now, the arena focuses on deliberate practice, journaling and scoring — the exact skills that translate directly to live accounts.",
    },
    {
      q: "Do you support crypto?",
      a: "Yes. You can paper-trade major crypto pairs alongside FX, indices and commodities, using real live prices and spreads.",
    },
    {
      q: "Can beginners use it?",
      a: "Absolutely. The onboarding assumes zero prior experience, and daily challenges guide you from your very first trade to disciplined, journaled execution.",
    },
    {
      q: "Is there a free plan?",
      a: "Yes. The Free tier is free forever and includes paper trading, journaling, leaderboards and daily challenges. Upgrade to Pro or Elite when you're ready for advanced analytics and prop-firm scoring.",
    },
  ];
  return (
    <section id="faq" className="relative z-10 mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        eyebrow="FAQ"
        title="Answers before you ask."
      />
      <div className="mt-12">
        <Accordion type="single" collapsible className="w-full space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`item-${i}`}
              className="rounded-2xl border border-border bg-surface/60 px-5 backdrop-blur"
            >
              <AccordionTrigger className="py-5 text-left text-base font-semibold hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Final CTA                                                           */
/* ------------------------------------------------------------------ */

function FinalCTA() {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <GlassCard className="relative overflow-hidden p-10 text-center md:p-16">
        <div className="pointer-events-none absolute inset-0 gradient-radial-glow opacity-100" />
        <div
          className="pointer-events-none absolute -inset-20 opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(60% 40% at 50% 50%, color-mix(in oklab, var(--primary) 30%, transparent), transparent)",
          }}
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Enter the arena
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Start Building Consistency Today.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground sm:text-lg">
            Join thousands of traders sharpening their edge with deliberate, gamified practice.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="gradient-primary text-primary-foreground shadow-elegant"
            >
              <Link to="/auth" search={{ mode: "register" }}>
                Create Free Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="glass">
              <Link to="/auth">
                Login
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </GlassCard>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function Footer() {
  const groups = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
        { label: "Arena", href: "#arena" },
        { label: "Challenges", href: "#challenges" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "FAQ", href: "#faq" },
        { label: "Contact", href: "mailto:hello@tradershive.app" },
        { label: "Status", href: "#" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: "#" },
        { label: "Terms", href: "#" },
        { label: "Disclosure", href: "#" },
      ],
    },
  ];
  return (
    <footer className="relative z-10 border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_2fr]">
          <div>
            <Link to="/" className="flex items-center gap-2" aria-label={APP_NAME}>
              <LogoMark />
              <span className="text-sm font-bold tracking-tight">{APP_NAME}</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Train. Trade. Compete. The gamified arena where traders forge a consistent edge.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <SocialLink href="#" label="Discord">
                <DiscordIcon />
              </SocialLink>
              <SocialLink href="#" label="Telegram">
                <TelegramIcon />
              </SocialLink>
              <SocialLink href="#" label="X">
                <XIcon />
              </SocialLink>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {groups.map((g) => (
              <div key={g.title}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {g.title}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {g.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href} className="text-foreground/80 transition hover:text-foreground">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p className="text-[11px]">
            Paper trading only. Not financial advice. Trading involves risk.
          </p>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface/60 text-muted-foreground transition hover:text-foreground hover:border-primary/40"
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Logo + brand icons                                                  */
/* ------------------------------------------------------------------ */

function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-xl gradient-primary text-primary-foreground shadow-elegant",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M4 17l5-5 4 4 7-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3l-.2.386c1.44.36 2.62.9 3.85 1.68A13.6 13.6 0 0 0 12 3.75c-2.62 0-5.05.5-8.2 1.32.83-.54 2.35-1.29 3.83-1.65L7.44 3A19.7 19.7 0 0 0 3.68 4.37C1.5 8.03.83 11.6 1.16 15.12c1.63 1.2 3.2 1.93 4.75 2.4l.86-1.18c-.84-.31-1.65-.7-2.42-1.19.2-.15.4-.31.6-.48 4.66 2.15 9.7 2.15 14.3 0 .2.17.4.33.6.48-.77.49-1.58.88-2.42 1.19l.86 1.18c1.55-.47 3.12-1.2 4.75-2.4.4-4.1-.63-7.63-2.72-10.75Zm-11.7 8.62c-.95 0-1.72-.87-1.72-1.94 0-1.06.76-1.94 1.72-1.94.97 0 1.74.88 1.72 1.94 0 1.07-.75 1.94-1.72 1.94Zm6.32 0c-.95 0-1.72-.87-1.72-1.94 0-1.06.76-1.94 1.72-1.94.97 0 1.74.88 1.72 1.94 0 1.07-.75 1.94-1.72 1.94Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="m9.04 15.47-.36 4.02c.52 0 .75-.22 1.02-.49l2.45-2.34 5.08 3.72c.93.52 1.6.25 1.85-.86l3.36-15.75c.33-1.39-.5-1.94-1.41-1.6L1.28 9.36c-1.36.53-1.34 1.29-.23 1.63l4.94 1.54L17.42 5.9c.54-.36 1.04-.16.63.2" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.55 8.63L23 22h-6.844l-5.36-6.99L4.6 22H1.34l8.08-9.23L1 2h7.02l4.84 6.4L18.244 2Zm-1.2 18h1.9L7.05 4H5.02l12.024 16Z" />
    </svg>
  );
}
