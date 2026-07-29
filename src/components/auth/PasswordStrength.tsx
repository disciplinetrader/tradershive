import { Check, X } from "lucide-react";
import { scorePassword } from "@/lib/auth-schemas";
import { cn } from "@/lib/utils";

interface Props {
  password: string;
  /** When false, requirement list is hidden. Bar still shows. */
  showRequirements?: boolean;
}

/**
 * Live password strength meter.
 * - 5-segment bar (empty → very weak → excellent).
 * - Requirements list updates on every keystroke:
 *   min length, uppercase, lowercase, number, special character.
 */
export function PasswordStrength({ password, showRequirements = true }: Props) {
  const { score, label, color, checks } = scorePassword(password);
  const hasInput = password.length > 0;

  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={hasInput ? score : 0} aria-label="Password strength">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              hasInput && i <= score ? color : "bg-border",
            )}
          />
        ))}
      </div>
      {hasInput && (
        <div className="flex items-center justify-between text-[11px]">
          <span className={cn("font-semibold", hasInput ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
          <span className="text-muted-foreground">{checks.filter((c) => c.pass).length} / 5</span>
        </div>
      )}
      {showRequirements && (
        <ul className="grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2" aria-label="Password requirements">
          {checks.map((c) => (
            <li
              key={c.label}
              className={cn(
                "inline-flex items-center gap-1.5 transition-colors",
                c.pass ? "text-success" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-3.5 w-3.5 place-items-center rounded-full",
                  c.pass ? "bg-success/15" : "bg-muted",
                )}
                aria-hidden
              >
                {c.pass ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
              </span>
              <span>{c.label}</span>
              <span className="sr-only">{c.pass ? "met" : "not met"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Live "passwords match" feedback shown under the confirm field. */
export function PasswordMatchIndicator({
  password,
  confirm,
}: {
  password: string;
  confirm: string;
}) {
  if (!confirm) return null;
  const match = password.length > 0 && password === confirm;
  return (
    <p
      className={cn(
        "mt-1 inline-flex items-center gap-1 text-[11px] font-medium transition-colors",
        match ? "text-success" : "text-danger",
      )}
      aria-live="polite"
    >
      {match ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {match ? "Passwords match" : "Passwords do not match"}
    </p>
  );
}
