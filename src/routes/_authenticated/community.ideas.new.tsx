import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createIdea } from "@/lib/community-ideas.functions";

export const Route = createFileRoute("/_authenticated/community/ideas/new")({
  head: () => ({
    meta: [
      { title: "Publish Trade Idea — Community" },
      { name: "description", content: "Publish a structured trade idea with entry, stop loss, take profit, and R:R." },
    ],
  }),
  component: NewIdeaPage,
});

function NewIdeaPage() {
  const navigate = useNavigate();
  const fn = useServerFn(createIdea);
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [timeframe, setTimeframe] = useState("H1");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [chartUrl, setChartUrl] = useState("");

  const rr = useMemo(() => {
    const e = parseFloat(entry), s = parseFloat(sl), t = parseFloat(tp);
    if ([e, s, t].some(isNaN)) return null;
    const risk = Math.abs(e - s), reward = Math.abs(t - e);
    return risk > 0 ? (reward / risk).toFixed(2) : null;
  }, [entry, sl, tp]);

  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        symbol, direction, timeframe: timeframe || null,
        entry: entry ? parseFloat(entry) : null,
        stop_loss: sl ? parseFloat(sl) : null,
        take_profit: tp ? parseFloat(tp) : null,
        rr: rr ? parseFloat(rr) : null,
        chart_url: chartUrl || null,
        tags: tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
        notes: notes || null,
      },
    }),
    onSuccess: (res) => {
      toast.success("Trade idea published");
      if (res.post_id) navigate({ to: "/community/post/$id", params: { id: res.post_id } });
      else navigate({ to: "/community/ideas" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to publish"),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Publish Trade Idea" description="Share a structured setup with the community." />
      <GlassCard className="p-4">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); if (!symbol) return toast.error("Symbol required"); mut.mutate(); }}
        >
          <Field label="Symbol *"><Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="EURUSD" required /></Field>
          <Field label="Direction *">
            <div className="flex gap-1 rounded-lg border border-border/50 p-1">
              {(["long", "short"] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDirection(d)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                    direction === d ? (d === "long" ? "bg-success text-success-foreground" : "bg-danger text-danger-foreground") : "text-muted-foreground"
                  }`}>{d}</button>
              ))}
            </div>
          </Field>
          <Field label="Timeframe"><Input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="H1, D1…" /></Field>
          <Field label="Chart URL"><Input value={chartUrl} onChange={(e) => setChartUrl(e.target.value)} placeholder="https://…" /></Field>
          <Field label="Entry"><Input type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} /></Field>
          <Field label="Stop loss"><Input type="number" step="any" value={sl} onChange={(e) => setSl(e.target.value)} /></Field>
          <Field label="Take profit"><Input type="number" step="any" value={tp} onChange={(e) => setTp(e.target.value)} /></Field>
          <Field label="R:R (auto)">
            <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm font-semibold">
              {rr ? rr : <span className="text-muted-foreground font-normal">—</span>}
            </div>
          </Field>
          <Field label="Tags (comma separated)" className="sm:col-span-2">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="breakout, ict, london" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Setup, invalidation, expectations…" />
          </Field>

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => history.back()}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Publishing…" : "Publish"}</Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

function Field({ label, children, className }: any) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
