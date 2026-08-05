/**
 * Product Tour — lightweight first-run onboarding.
 *
 * - Spotlights DOM elements by `data-tour="<id>"` selector.
 * - Falls back to a centered modal card when no target is present.
 * - Completion + skip persisted in localStorage; user can replay from Settings.
 *
 * No third-party dependency; all positioning is plain DOM measurement.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "thv:tour:completed:v1";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** CSS selector for the highlight target; omit for a centered modal step. */
  target?: string;
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to TradersHIVE",
    body: "This platform helps you practice, analyse and improve your trading. The tour takes under a minute.",
  },
  {
    id: "trading",
    title: "Paper Trading",
    body: "Test ideas in the live Trading Workspace without risking real money. Full charts, orders and risk management.",
    target: '[data-tour="nav-trading"]',
  },
  {
    id: "replay",
    title: "Replay Studio",
    body: "Practice historical markets just like live trading. Rewind, pause and take deliberate trades on real data.",
    target: '[data-tour="nav-replay"]',
  },

  {
    id: "journal",
    title: "Journal",
    body: "Record every trade and review your mistakes. Screenshots, R-multiples and notes in one place.",
    target: '[data-tour="nav-journal"]',
  },
  {
    id: "analytics",
    title: "Performance Analytics",
    body: "See where you're making or losing money. Sessions, symbols and behaviour patterns broken out.",
    target: '[data-tour="nav-analytics"]',
  },
  {
    id: "mentor",
    title: "AI Trading Mentor",
    body: "Your 24/7 personal coach. Ask questions about your trades, get psychology insights, or open the full AI Workspace for deep analysis.",
  },

  {
    id: "community",
    title: "Community",
    body: "Share ideas and learn with other traders. Follow strategies, comment, and grow together.",
    target: '[data-tour="nav-community"]',
  },
  {
    id: "support",
    title: "Need Help?",
    body: "Contact support or send us feedback directly from the Support page. Our AI Mentor is also always available in the bottom right.",
    target: '[data-tour="nav-support"]',
  },
  {
    id: "finish",
    title: "You're ready",
    body: "Start improving your trading. You can replay this tour anytime from Settings.",
  },

];

/* ------------------------------------------------------------------ context */

type TourCtx = {
  start: () => void;
  hasCompleted: boolean;
};

const Ctx = createContext<TourCtx | null>(null);

export function useProductTour() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useProductTour must be used inside <ProductTourProvider>");
  return c;
}

export function ProductTourProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(true); // assume completed to avoid SSR flash

  // Hydrate completion flag and auto-start for first-time users.
  useEffect(() => {
    let done = true;
    try {
      done = localStorage.getItem(STORAGE_KEY) === "1";
    } catch { /* noop */ }
    setHasCompleted(done);
    if (!done) {
      // Delay slightly so the shell has painted and nav targets exist.
      const t = window.setTimeout(() => {
        setStep(0);
        setOpen(true);
      }, 400);
      return () => window.clearTimeout(t);
    }
  }, []);

  const start = useCallback(() => {
    setStep(0);
    setOpen(true);
    try {
      // Lightweight forwarder; ignore if analytics module absent.
      void import("@/lib/onboarding/analytics").then((m) => m.trackOnboarding("tour_started"));
    } catch { /* noop */ }
  }, []);

  const markCompleted = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* noop */ }
    setHasCompleted(true);
    setOpen(false);
    try {
      void import("@/lib/onboarding/analytics").then((m) => m.trackOnboarding("tour_completed"));
    } catch { /* noop */ }
  }, []);

  const value = useMemo<TourCtx>(() => ({ start, hasCompleted }), [start, hasCompleted]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {open ? (
        <TourOverlay
          steps={STEPS}
          step={step}
          onStep={setStep}
          onClose={markCompleted}
        />
      ) : null}
    </Ctx.Provider>
  );
}

/* ------------------------------------------------------------------ overlay */

type Rect = { top: number; left: number; width: number; height: number };

function TourOverlay({
  steps,
  step,
  onStep,
  onClose,
}: {
  steps: TourStep[];
  step: number;
  onStep: (i: number) => void;
  onClose: () => void;
}) {
  const s = steps[step];
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  // Keeps anchored steps in the same column when a target can't be measured.
  const lastAnchorLeft = useRef(320);


  // Measure highlighted target when the step changes or the viewport moves.
  useLayoutEffect(() => {
    let cancelled = false;

    function measure() {
      if (cancelled) return;
      if (!s.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(s.target);
      if (!el) {
        setRect(null);
        return;
      }
      // Ensure the target is visible in the viewport before measuring.
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    measure();
    // Retry once after layout settles (mobile sidebars, transitions).
    const t = window.setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [s.target, step]);

  // Position the tooltip card near the target (or center it when standalone).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const margin = 16;

    // Steps that highlight a nav item always sit in the same anchored column,
    // so the card never jumps to the middle of the screen mid-tour. Only the
    // intro/outro steps (no target) are centered.
    const anchored = Boolean(s.target);

    if (!rect) {
      setCardPos(
        anchored
          ? {
              top: clamp(96, margin, Math.max(margin, vh - ch - margin)),
              left: clamp(lastAnchorLeft.current, margin, Math.max(margin, vw - cw - margin)),
            }
          : {
              top: Math.max(margin, (vh - ch) / 2),
              left: Math.max(margin, (vw - cw) / 2),
            },
      );
      return;
    }

    // Prefer right of the target (desktop sidebar), then below, then above.
    const spaceRight = vw - (rect.left + rect.width) - margin;
    const spaceBelow = vh - (rect.top + rect.height) - margin;

    let top: number;
    let left: number;

    if (spaceRight >= cw + margin) {
      left = rect.left + rect.width + 12;
      top = clamp(rect.top, margin, Math.max(margin, vh - ch - margin));
    } else if (spaceBelow >= ch + margin) {
      top = rect.top + rect.height + 12;
      left = clamp(rect.left, margin, Math.max(margin, vw - cw - margin));
    } else {
      top = clamp(rect.top - ch - 12, margin, Math.max(margin, vh - ch - margin));
      left = clamp(rect.left, margin, Math.max(margin, vw - cw - margin));
    }

    lastAnchorLeft.current = left;
    setCardPos({ top, left });

  }, [rect, step, s.target]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function next() {
    if (step >= steps.length - 1) onClose();
    else onStep(step + 1);
  }
  function prev() {
    if (step > 0) onStep(step - 1);
  }

  const total = steps.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const content = (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Spotlight — four dark rectangles around the target, or a full overlay. */}
      {rect ? <Spotlight rect={rect} /> : (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      )}

      {/* Highlight ring around the target */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.25)] transition-all"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      ) : null}

      {/* Tooltip card */}
      <div
        ref={cardRef}
        className="absolute w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-2xl"
        style={cardPos ?? { top: -9999, left: -9999 }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Step {step + 1} of {total}
              </p>
              <h3 className="truncate text-sm font-semibold">{s.title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tour"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="px-4 py-3 text-sm text-muted-foreground">{s.body}</p>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            {isLast ? "Close" : "Skip tour"}
          </button>

          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition ${i === step ? "bg-primary w-4" : "bg-muted-foreground/30"}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={prev}
              disabled={isFirst}
              className="h-8 px-2"
              aria-label="Previous step"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={next}
              className="h-8"
            >
              {isLast ? "Finish" : "Next"}
              {isLast ? null : <ArrowRight className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function Spotlight({ rect }: { rect: Rect }) {
  // Four dark rectangles that surround `rect`, leaving the target visible.
  const OVERLAY = "absolute bg-black/70 backdrop-blur-[2px]";
  const top = { top: 0, left: 0, right: 0, height: Math.max(0, rect.top - 6) };
  const bottom = {
    top: rect.top + rect.height + 6,
    left: 0,
    right: 0,
    bottom: 0,
  };
  const left = {
    top: rect.top - 6,
    left: 0,
    width: Math.max(0, rect.left - 6),
    height: rect.height + 12,
  };
  const right = {
    top: rect.top - 6,
    left: rect.left + rect.width + 6,
    right: 0,
    height: rect.height + 12,
  };
  return (
    <>
      <div className={OVERLAY} style={top} />
      <div className={OVERLAY} style={bottom} />
      <div className={OVERLAY} style={left} />
      <div className={OVERLAY} style={right} />
    </>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
