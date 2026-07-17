import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  ChevronRight,
  LineChart,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { APP_NAME } from "@/lib/constants";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TradersHIVE Arena — Train. Trade. Compete." },
      {
        name: "description",
        content:
          "Sharpen your edge with paper trading, a professional journal, gamified challenges, and global leaderboards. TradersHIVE Arena is where traders level up.",
      },
      { property: "og:title", content: "TradersHIVE Arena — Train. Trade. Compete." },
      {
        property: "og:description",
        content:
          "Paper trade, journal every setup, complete challenges, climb leagues. The arena for serious traders.",
      },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: LineChart,
    title: "Paper Trading",
    desc: "Execute risk-free with live market data, real spreads, and TradingView-grade charts.",
  },
  {
    icon: BookOpen,
    title: "Pro Journal",
    desc: "Log every trade with screenshots, tags, R-multiples, and psychology notes.",
  },
  {
    icon: Trophy,
    title: "Challenges",
    desc: "Weekly missions and prop-firm style objectives with XP and coin rewards.",
  },
  {
    icon: Award,
    title: "Leagues",
    desc: "Climb from Bronze to Grandmaster on global and regional leaderboards.",
  },
  {
    icon: BarChart3,
    title: "Statistics",
    desc: "Deep analytics on edge, drawdown, win-rate, expectancy and consistency.",
  },
  {
    icon: Sparkles,
    title: "AI Coach",
    desc: "Personalized nudges that turn journal patterns into actionable habits.",
  },
];

function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] gradient-radial-glow" />

      {/* Header */}
      <header className="relative z-20">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="text-sm font-bold tracking-tight">{APP_NAME}</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a className="transition hover:text-foreground" href="#features">Features</a>
            <a className="transition hover:text-foreground" href="#arena">Arena</a>
            <a className="transition hover:text-foreground" href="#pricing">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="gradient-primary text-primary-foreground shadow-elegant">
              <Link to="/auth" search={{ mode: "register" }}>
                Get started
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-16 pb-24 md:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <Badge variant="outline" className="mb-6 inline-flex items-center gap-2 border-border/60 bg-surface/60 px-3 py-1 text-xs backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Season 1 · Now live
          </Badge>
          <h1 className="text-balance text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">
            <span className="text-gradient">Train. Trade.</span>
            <br />
            <span className="text-foreground">Compete.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            TradersHIVE Arena turns deliberate practice into a game. Paper-trade real markets,
            journal every setup, complete challenges, and climb global leagues alongside a
            community of serious traders.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gradient-primary text-primary-foreground shadow-elegant">
              <Link to="/auth" search={{ mode: "register" }}>
                <Zap className="mr-2 h-4 w-4" />
                Enter the arena
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="glass">
              <Link to="/auth">
                Sign in
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span>Zero risk</span>
            <span>·</span>
            <span>Real market data</span>
            <span>·</span>
            <span>Level 1 → 100</span>
          </div>
        </motion.div>

        {/* Hero mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mt-16 max-w-6xl"
        >
          <div className="relative rounded-3xl border border-border bg-surface/60 p-2 shadow-elegant backdrop-blur">
            <div className="rounded-2xl bg-gradient-to-br from-surface to-background p-6 md:p-10">
              <HeroMockup />
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            The Arena
          </p>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">Everything a serious trader needs</h2>
          <p className="mt-4 text-muted-foreground">
            One platform for practice, review, and competition — engineered for speed and clarity.
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
            >
              <GlassCard className="hover-lift h-full p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="arena" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <GlassCard className="relative overflow-hidden p-10 md:p-16">
          <div className="pointer-events-none absolute inset-0 gradient-radial-glow" />
          <div className="relative flex flex-col items-center gap-6 text-center">
            <h2 className="max-w-2xl text-balance text-4xl font-bold md:text-5xl">
              Your edge, forged in the arena.
            </h2>
            <p className="max-w-xl text-muted-foreground">
              Free forever to train. Upgrade when you want challenges, deep analytics, and prop-firm
              scoring.
            </p>
            <Button asChild size="lg" className="gradient-primary text-primary-foreground shadow-elegant">
              <Link to="/auth" search={{ mode: "register" }}>
                Create free account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </GlassCard>
      </section>

      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-5" />
            <span>© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a className="hover:text-foreground" href="#">Terms</a>
            <a className="hover:text-foreground" href="#">Privacy</a>
            <a className="hover:text-foreground" href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <div
      className={`${className} grid place-items-center rounded-lg gradient-primary text-primary-foreground shadow-elegant`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
        <path d="M4 17l5-5 4 4 7-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function HeroMockup() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="glass rounded-2xl p-5 md:col-span-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">BTCUSD · 1H</span>
          <span className="text-primary">+2.48%</span>
        </div>
        <div className="mt-4 h-48">
          <MiniChart />
        </div>
      </div>
      <div className="space-y-3">
        <MockStat label="Equity" value="$128,420" delta="+4.2%" positive />
        <MockStat label="Win rate" value="61%" delta="+2.1%" positive />
        <MockStat label="Streak" value="7 days" delta="Elite" positive />
      </div>
    </div>
  );
}

function MockStat({
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
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-2xl font-semibold">{value}</span>
        <span className={positive ? "text-primary text-xs" : "text-danger text-xs"}>{delta}</span>
      </div>
    </div>
  );
}

function MiniChart() {
  const points = [12, 22, 18, 30, 28, 40, 34, 46, 42, 58, 54, 66, 62, 74, 70, 82];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((p - min) / (max - min || 1)) * 100;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="glow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L100,100 L0,100 Z`} fill="url(#glow)" />
      <path d={path} stroke="var(--primary)" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
