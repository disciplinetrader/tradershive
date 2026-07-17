import { Check, X } from "lucide-react";
import { scorePassword } from "@/lib/auth-schemas";
import { cn } from "@/lib/utils";

export function PasswordStrength({ password }: { password: string }) {
  const { score, label, color, checks } = scorePassword(password);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= score && password ? color : "bg-border",
            )}
          />
        ))}
      </div>
      {password ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
          <span className="font-semibold text-foreground">{label}</span>
          <span className="text-muted-foreground">· requirements:</span>
          {checks.map((c) => (
            <span
              key={c.label}
              className={cn(
                "inline-flex items-center gap-1",
                c.pass ? "text-success" : "text-muted-foreground",
              )}
            >
              {c.pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
