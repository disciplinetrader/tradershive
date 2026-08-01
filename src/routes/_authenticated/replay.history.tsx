import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { HistoryView } from "@/components/replay/review/HistoryView";

const searchSchema = z.object({
  limit: z.number().optional().default(25),
  offset: z.number().optional().default(0),
  status: z.string().nullable().optional().default(null),
  symbol: z.string().nullable().optional().default(null),
  search: z.string().nullable().optional().default(null),
});

export const Route = createFileRoute("/_authenticated/replay/history")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Replay History — TradersHIVE" },
      { name: "description", content: "Every replay session you have run, with trade counts, net result and session score." },
      { property: "og:title", content: "Replay History — TradersHIVE" },
      { property: "og:description", content: "Browse and filter your full replay practice history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Nothing here.</div>,
});

function HistoryPage() {
  const search = useSearch({ from: "/_authenticated/replay/history" });
  const navigate = useNavigate({ from: "/replay/history" });
  return (
    <HistoryView
      params={{
        limit: search.limit,
        offset: search.offset,
        status: search.status ?? null,
        symbol: search.symbol ?? null,
        search: search.search ?? null,
      }}
      onChange={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  );
}
