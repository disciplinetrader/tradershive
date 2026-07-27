/**
 * QA Mode floating developer panel.
 *
 * Reads live signals from the telemetry sink (`src/lib/observability/sink.ts`)
 * plus its own listeners for image errors, console warnings/errors, and
 * broken link/asset responses. Only rendered when QA Mode is enabled AND the
 * caller is an admin OR the app is running in dev.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bug,
  ChevronDown,
  Database,
  Gauge,
  ImageOff,
  Link2Off,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { getRecentEvents, type TelemetryEvent } from "@/lib/observability/sink";
import { useQaMode } from "@/lib/qa-mode";
import { twelveDataUsage } from "@/lib/market-data/twelvedata.functions";
import { marketData } from "@/lib/market-data/engine";
import { getProvider } from "@/lib/market-data/providers/registry";
import { cn } from "@/lib/utils";

type ConsoleEntry = { level: "warn" | "error"; message: string; at: number };
type AssetEntry = { kind: "image" | "link" | "script" | "style"; url: string; at: number };

export function QaModePanel() {
  const { enabled, toggle } = useQaMode();
  const [open, setOpen] = useState(true);
  const [, force] = useState(0);
  const [tab, setTab] = useState<"perf" | "api" | "console" | "assets" | "market">("perf");
  const consoleRef = useRef<ConsoleEntry[]>([]);
  const assetsRef = useRef<AssetEntry[]>([]);

  // Install once when enabled.
  useEffect(() => {
    if (!enabled) return;
    const origError = console.error;
    const origWarn = console.warn;
    const push = (level: "warn" | "error", args: unknown[]) => {
      const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : safeJson(a))).join(" ");
      consoleRef.current = [{ level, message: msg.slice(0, 500), at: Date.now() }, ...consoleRef.current].slice(0, 100);
    };
    console.error = (...args: unknown[]) => {
      push("error", args);
      return origError.apply(console, args as []);
    };
    console.warn = (...args: unknown[]) => {
      push("warn", args);
      return origWarn.apply(console, args as []);
    };

    const onAssetError = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (!el || !(el as HTMLElement).tagName) return;
      const tag = el.tagName.toLowerCase();
      let kind: AssetEntry["kind"] | null = null;
      let url = "";
      if (tag === "img") {
        kind = "image";
        url = (el as HTMLImageElement).src;
      } else if (tag === "link") {
        kind = "style";
        url = (el as HTMLLinkElement).href;
      } else if (tag === "script") {
        kind = "script";
        url = (el as HTMLScriptElement).src;
      }
      if (!kind || !url) return;
      assetsRef.current = [{ kind, url, at: Date.now() }, ...assetsRef.current].slice(0, 100);
    };
    // Capture-phase to catch bubble-less error events on img/link/script.
    window.addEventListener("error", onAssetError, true);

    // Track anchor clicks; if the target is same-origin and returns 4xx/5xx on a
    // HEAD probe, log it as a broken link.
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;
      const href = anchor.href;
      if (!/^https?:/i.test(href)) return;
      // Fire-and-forget probe.
      void fetch(href, { method: "HEAD", mode: "no-cors" }).catch(() => {
        assetsRef.current = [{ kind: "link" as const, url: href, at: Date.now() }, ...assetsRef.current].slice(0, 100);
      });
    };
    document.addEventListener("click", onClick, true);

    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => {
      console.error = origError;
      console.warn = origWarn;
      window.removeEventListener("error", onAssetError, true);
      document.removeEventListener("click", onClick, true);
      window.clearInterval(t);
    };
  }, [enabled]);

  const stats = useMemo(() => computeStats(), [enabled, tab]);

  if (!enabled) return null;

  const events = getRecentEvents();
  const apiEvents = events.filter((e) => e.category === "api").slice(-30).reverse();

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[380px] max-w-[calc(100vw-2rem)] font-mono text-xs">
      <div className="rounded-xl border border-primary/40 bg-background/95 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">QA Mode</span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={open ? "Collapse panel" : "Expand panel"}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition", open ? "" : "-rotate-90")} />
            </button>
            <button
              type="button"
              onClick={() => toggle(false)}
              className="rounded p-1 text-muted-foreground hover:bg-danger/20 hover:text-danger"
              aria-label="Disable QA Mode"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>

        {open && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-4 gap-px bg-border/40">
              <Kpi icon={Gauge} label="LCP" value={fmtMs(stats.lcp)} tone={tone(stats.lcp, 2500, 4000)} />
              <Kpi icon={Timer} label="API avg" value={fmtMs(stats.apiAvg)} tone={tone(stats.apiAvg, 500, 1500)} />
              <Kpi icon={AlertTriangle} label="Errors" value={String(stats.errors)} tone={stats.errors ? "bad" : "good"} />
              <Kpi icon={Zap} label="Long" value={String(stats.longTasks)} tone={tone(stats.longTasks, 3, 10)} />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/60 text-[10px] uppercase tracking-wider">
              {(["perf", "api", "console", "assets"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 px-2 py-2 transition",
                    tab === t
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="max-h-[280px] overflow-auto p-2">
              {tab === "perf" && <PerfList stats={stats} />}
              {tab === "api" && <ApiList events={apiEvents} />}
              {tab === "console" && <ConsoleList entries={consoleRef.current} />}
              {tab === "assets" && <AssetList entries={assetsRef.current} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const color =
    tone === "bad"
      ? "text-danger"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "good"
          ? "text-emerald-400"
          : "text-muted-foreground";
  return (
    <div className="flex flex-col items-start gap-0.5 bg-background/60 p-2">
      <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={cn("text-sm font-bold tabular-nums", color)}>{value}</span>
    </div>
  );
}

function PerfList({ stats }: { stats: PerfStats }) {
  return (
    <dl className="space-y-1">
      <Row label="Navigation">{fmtMs(stats.nav)}</Row>
      <Row label="DOM Content Loaded">{fmtMs(stats.dcl)}</Row>
      <Row label="First Paint">{fmtMs(stats.fp)}</Row>
      <Row label="First Contentful Paint">{fmtMs(stats.fcp)}</Row>
      <Row label="Largest Contentful Paint">{fmtMs(stats.lcp)}</Row>
      <Row label="Long tasks &gt;50ms">{stats.longTasks}</Row>
      <Row label="JS heap">{stats.heap ? `${stats.heap.toFixed(1)} MB` : "—"}</Row>
      <Row label="Resources loaded">{stats.resources}</Row>
    </dl>
  );
}

function ApiList({ events }: { events: TelemetryEvent[] }) {
  if (!events.length) return <Empty>No API calls tracked yet.</Empty>;
  return (
    <ul className="space-y-1">
      {events.map((e, i) => {
        const status = (e.data?.status as number | undefined) ?? 0;
        const url = (e.data?.url as string | undefined) ?? "";
        const method = (e.data?.method as string | undefined) ?? "";
        const bad = e.name !== "slow";
        return (
          <li key={i} className="rounded border border-border/50 bg-card/40 p-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded px-1 text-[9px] font-bold uppercase",
                  bad ? "bg-danger/20 text-danger" : "bg-amber-500/20 text-amber-400",
                )}
              >
                {e.name}
              </span>
              <span className="text-muted-foreground">{method}</span>
              {status ? <span className="text-muted-foreground">· {status}</span> : null}
              <span className="ml-auto tabular-nums">{fmtMs(e.value)}</span>
            </div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={url}>
              {url}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ConsoleList({ entries }: { entries: ConsoleEntry[] }) {
  if (!entries.length) return <Empty>No warnings or errors captured.</Empty>;
  return (
    <ul className="space-y-1">
      {entries.map((e, i) => (
        <li
          key={i}
          className={cn(
            "rounded border p-1.5",
            e.level === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300",
          )}
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
            <Bug className="h-3 w-3" />
            {e.level}
            <span className="ml-auto text-muted-foreground">{fmtTime(e.at)}</span>
          </div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground/80">
            {e.message}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AssetList({ entries }: { entries: AssetEntry[] }) {
  if (!entries.length) return <Empty>No missing images or broken links detected.</Empty>;
  return (
    <ul className="space-y-1">
      {entries.map((e, i) => {
        const Icon = e.kind === "image" ? ImageOff : Link2Off;
        return (
          <li key={i} className="flex items-center gap-1.5 rounded border border-danger/40 bg-danger/10 p-1.5">
            <Icon className="h-3.5 w-3.5 text-danger" />
            <span className="rounded bg-danger/20 px-1 text-[9px] font-bold uppercase text-danger">
              {e.kind}
            </span>
            <span className="ml-1 truncate text-[10px] text-foreground/80" title={e.url}>
              {e.url}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">{fmtTime(e.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded border border-border/40 bg-card/30 px-2 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-[11px] text-muted-foreground">{children}</div>;
}

/* ---------------- stats ---------------- */

type PerfStats = {
  nav: number | undefined;
  dcl: number | undefined;
  fp: number | undefined;
  fcp: number | undefined;
  lcp: number | undefined;
  longTasks: number;
  heap: number | undefined;
  resources: number;
  apiAvg: number | undefined;
  errors: number;
};

function computeStats(): PerfStats {
  if (typeof performance === "undefined") {
    return {
      nav: undefined, dcl: undefined, fp: undefined, fcp: undefined, lcp: undefined,
      longTasks: 0, heap: undefined, resources: 0, apiAvg: undefined, errors: 0,
    };
  }
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const paints = performance.getEntriesByType("paint");
  const fp = paints.find((p) => p.name === "first-paint")?.startTime;
  const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime;
  const lcpEntries = safeGetEntries("largest-contentful-paint");
  const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : undefined;
  const longTasks = safeGetEntries("longtask").length;
  const resources = performance.getEntriesByType("resource").length;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const heap = mem ? mem.usedJSHeapSize / 1024 / 1024 : undefined;

  const events = getRecentEvents();
  const apis = events.filter((e) => e.category === "api" && typeof e.value === "number");
  const apiAvg = apis.length ? apis.reduce((s, e) => s + (e.value ?? 0), 0) / apis.length : undefined;
  const errors = events.filter((e) => e.category === "api" && e.name !== "slow").length;

  return {
    nav: nav?.duration,
    dcl: nav ? nav.domContentLoadedEventEnd - nav.startTime : undefined,
    fp, fcp, lcp, longTasks, heap, resources, apiAvg, errors,
  };
}

function safeGetEntries(type: string): PerformanceEntry[] {
  try {
    return performance.getEntriesByType(type);
  } catch {
    return [];
  }
}

function tone(v: number | undefined, warn: number, bad: number): "good" | "warn" | "bad" | "muted" {
  if (v == null) return "muted";
  if (v >= bad) return "bad";
  if (v >= warn) return "warn";
  return "good";
}

function fmtMs(v: number | undefined) {
  if (v == null) return "—";
  if (v < 1000) return `${Math.round(v)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

function fmtTime(t: number) {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour12: false });
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
