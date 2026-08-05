/**
 * Feedback context + floating launcher + keyboard shortcut (Ctrl+Shift+B).
 *
 * Provides `useFeedback().open(type?)` so any component (settings, help menu,
 * error boundary) can open the dialog. The launcher renders a floating pill
 * button in the bottom-right on authenticated screens.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { FeedbackDialog, type FeedbackType } from "./FeedbackDialog";

type Ctx = {
  open: (type?: FeedbackType) => void;
  close: () => void;
};

const FeedbackContext = createContext<Ctx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialType, setInitialType] = useState<FeedbackType>("bug");

  const open = useCallback((type?: FeedbackType) => {
    if (type) setInitialType(type);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<Ctx>(() => ({ open, close }), [open, close]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackDialog open={isOpen} onOpenChange={setIsOpen} initialType={initialType} />
    </FeedbackContext.Provider>

  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within a FeedbackProvider");
  return ctx;
}

function FeedbackLauncher({ onClick }: { onClick: () => void }) {
  // The Trading Workspace is a focused environment — never cover chart or
  // order controls with a persistent floating button. Feedback stays
  // reachable via Ctrl+Shift+B and from Settings > Help.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/trading") || pathname.startsWith("/replay/studio")) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Send feedback (Ctrl+Shift+B)"
      title="Send feedback  ·  Ctrl+Shift+B"
      className={cn(
        "fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full",
        "border border-primary/30 bg-primary text-primary-foreground",
        "px-4 py-2.5 text-sm font-medium shadow-elegant",
        "transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        "min-h-11 min-w-11",
      )}
    >
      <MessageSquarePlus className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Feedback</span>
    </button>
  );
}
