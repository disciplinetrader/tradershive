import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "th_beta_banner_dismissed_v1";

/**
 * Lightweight closed-beta message shown once per user (dismissible).
 * No billing, no CTA — just a warm welcome + statement that everything
 * is free during the beta.
 */
export function BetaBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setHidden(true);
  };

  if (hidden) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-elegant">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">
            🎉 Welcome to the TradersHIVE Closed Beta
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Thank you for helping us test the platform. During the beta, every feature is
            available free of charge while we collect feedback and improve the product.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss beta message"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
