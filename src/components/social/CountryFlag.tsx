import { countryFlag } from "@/lib/social/constants";
import { cn } from "@/lib/utils";

export function CountryFlag({ country, showName = false, className }: { country: string | null | undefined; showName?: boolean; className?: string }) {
  const flag = countryFlag(country);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)} title={country ?? "Unknown"}>
      <span className="text-base leading-none" aria-hidden>{flag}</span>
      {showName ? <span className="truncate">{country ?? "—"}</span> : null}
    </span>
  );
}
