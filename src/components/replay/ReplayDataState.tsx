import { AlertTriangle, DatabaseZap, FlaskConical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useReplay } from "./context";
import { describeProvenance, hasProvenance, LEGACY_PROVENANCE_LABEL } from "@/lib/replay/provenance";

/**
 * Blocking state shown when a replay session has no real market data.
 *
 * We deliberately show an actionable error instead of generating candles:
 * practising on fabricated price action is worse than not practising.
 */
export function ReplayDataUnavailable({ onRetry }: { onRetry?: () => void }) {
  const { session, dataUnavailable } = useReplay();
  if (!dataUnavailable) return null;

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
          <DatabaseZap className="h-5 w-5 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold">No market data for this session</h3>
          <p className="text-sm text-muted-foreground">{dataUnavailable.message}</p>
        </div>
        <p className="rounded-md bg-muted/50 p-3 text-left text-xs text-muted-foreground">
          {dataUnavailable.remedy}
        </p>
        {dataUnavailable.providerError ? (
          <p className="text-left text-[11px] text-muted-foreground/70">
            Provider said: {dataUnavailable.providerError}
          </p>
        ) : null}
        <div className="flex justify-center gap-2">
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          {session?.symbol} · {session?.timeframe}
        </p>
      </div>
    </div>
  );
}

/**
 * Small provenance badge so a trader can always tell where the candles on
 * screen came from — stored history, an on-demand import, or demo data.
 */
export function ReplayDataSourceBadge() {
  const { dataSource, provenance } = useReplay();

  // Persisted provenance wins: it survives refresh and describes the frozen
  // dataset, not the current request.
  if (hasProvenance(provenance)) {
    const demo = provenance!.coverage_status === "demo";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={demo ? "destructive" : "outline"} className="gap-1 text-[10px]">
            {demo ? <FlaskConical className="h-3 w-3" /> : null}
            {demo ? "DEMO DATA" : provenance!.source_provider}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div>{describeProvenance(provenance)}</div>
          <div className="mt-1 text-muted-foreground">
            {provenance!.actual_start?.slice(0, 16).replace("T", " ")} →{" "}
            {provenance!.actual_end?.slice(0, 16).replace("T", " ")}
            {provenance!.known_gaps?.length ? ` · ${provenance!.known_gaps.length} gap(s)` : ""}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!dataSource?.kind) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
        {LEGACY_PROVENANCE_LABEL}
      </Badge>
    );
  }

  if (dataSource.isSynthetic) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="gap-1 text-[10px] uppercase tracking-wide">
            <FlaskConical className="h-3 w-3" /> Demo data
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          These candles are generated, not real market history. Results are not comparable to live trading.
        </TooltipContent>
      </Tooltip>
    );
  }

  const pct = Math.round((dataSource.coverage?.ratio ?? 0) * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 text-[10px]">
          {dataSource.warning ? <AlertTriangle className="h-3 w-3 text-amber-500" /> : null}
          {dataSource.label ?? "historical"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 text-xs">
          <div>Source: {dataSource.label} ({dataSource.kind})</div>
          <div>Coverage: {dataSource.coverage?.actual} candles · {pct}% of expected</div>
          {dataSource.coverage?.gaps ? <div>{dataSource.coverage.gaps} gap(s) in range</div> : null}
          {dataSource.warning ? <div className="text-amber-500">{dataSource.warning}</div> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
