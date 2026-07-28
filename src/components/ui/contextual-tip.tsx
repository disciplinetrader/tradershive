import { useEffect, useState, type ReactNode } from "react";
import { Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY_PREFIX = "thv:tip:dismissed:";

/**
 * Small dismissible tip. Once dismissed by id, the tip never renders again
 * for the current browser. Use for keyboard hints, feature callouts, etc.
 */
export function ContextualTip({
  id,
  children,
  icon,
  className,
}: {
  id: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(KEY_PREFIX + id) === "1");
    } catch {
      setDismissed(false);
    }
  }, [id]);

  if (dismissed) return null;

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground",
        className,
      )}
    >
      <span className="mt-0.5 text-primary" aria-hidden>
        {icon ?? <Lightbulb className="h-3.5 w-3.5" />}
      </span>
      <div className="flex-1">{children}</div>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY_PREFIX + id, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        className="rounded-md p-1 text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
