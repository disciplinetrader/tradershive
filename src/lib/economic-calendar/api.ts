/**
 * Economic calendar — client access.
 *
 * Reads come straight from the database under RLS (any signed-in user may
 * read the calendar); nothing here writes. Ingestion is a server-side cron
 * job (`/api/public/hooks/economic-calendar`).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type EconomicEvent, type NewsImpact } from "./types";

interface Row {
  id: string;
  event_time: string;
  currency: string;
  title: string;
  impact: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

function toEvent(r: Row): EconomicEvent {
  return {
    id: r.id,
    timeMs: Date.parse(r.event_time),
    currency: r.currency,
    title: r.title,
    impact: (["high", "medium", "low", "holiday"].includes(r.impact) ? r.impact : "low") as NewsImpact,
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
  };
}

export async function fetchEconomicEvents(opts: {
  fromMs: number;
  toMs: number;
  currencies?: string[];
  impacts?: NewsImpact[];
}): Promise<EconomicEvent[]> {
  let q = supabase
    .from("economic_events")
    .select("id,event_time,currency,title,impact,actual,forecast,previous")
    .gte("event_time", new Date(opts.fromMs).toISOString())
    .lte("event_time", new Date(opts.toMs).toISOString())
    .order("event_time", { ascending: true })
    .limit(1000);

  if (opts.currencies?.length) q = q.in("currency", opts.currencies);
  if (opts.impacts?.length) q = q.in("impact", opts.impacts);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toEvent);
}

/** Calendar events overlapping a window, cached per window + filter. */
export function useEconomicEvents(opts: {
  fromMs: number | null;
  toMs: number | null;
  currencies?: string[];
  impacts?: NewsImpact[];
  enabled?: boolean;
}) {
  const { fromMs, toMs, currencies, impacts, enabled = true } = opts;
  return useQuery({
    queryKey: ["economic-events", fromMs, toMs, currencies?.join(",") ?? "", impacts?.join(",") ?? ""],
    enabled: enabled && fromMs != null && toMs != null,
    staleTime: 5 * 60_000,
    queryFn: () => fetchEconomicEvents({ fromMs: fromMs!, toMs: toMs!, currencies, impacts }),
  });
}
