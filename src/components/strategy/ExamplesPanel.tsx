import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, Trash2, Plus, Film, BookOpen, LineChart } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addExample, deleteExample } from "@/lib/strategy.functions";
import { supabase } from "@/integrations/supabase/client";

export function ExamplesPanel({ strategyId, initial, userId }: { strategyId: string; initial: any[]; userId: string }) {
  const qc = useQueryClient();
  const add = useServerFn(addExample);
  const del = useServerFn(deleteExample);

  const recent = useQuery({
    queryKey: ["strategy", "recent-attachable", userId],
    queryFn: async () => {
      const [{ data: trades }, { data: journals }, { data: replays }] = await Promise.all([
        supabase.from("paper_trades").select("id,symbol,pnl,closed_at").eq("user_id", userId).eq("status", "closed").order("closed_at", { ascending: false }).limit(10),
        supabase.from("journal_entries").select("id,symbol,pnl,closed_at").eq("user_id", userId).order("closed_at", { ascending: false }).limit(10),
        supabase.from("replay_sessions").select("id,title,symbol,timeframe").eq("user_id", userId).order("updated_at", { ascending: false }).limit(10),
      ]);
      return { trades: trades ?? [], journals: journals ?? [], replays: replays ?? [] };
    },
  });

  const addMut = useMutation({
    mutationFn: async (payload: any) => add({ data: { strategy_id: strategyId, ...payload } }),
    onSuccess: () => { toast.success("Attached"); qc.invalidateQueries({ queryKey: ["strategy", strategyId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["strategy", strategyId] }),
  });

  const [note, setNote] = useState("");

  return (
    <div className="space-y-3">
      <GlassCard className="p-4 space-y-3">
        <div className="text-sm font-semibold">Add a quick note</div>
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Insight, mistake, review…" className="h-9" />
          <Button onClick={() => { if (!note.trim()) return; addMut.mutate({ ref_type: "note", title: note }); setNote(""); }}>
            <Plus className="mr-1 h-3.5 w-3.5" />Add
          </Button>
        </div>
      </GlassCard>

      <div className="grid gap-3 md:grid-cols-3">
        <QuickList title="Recent Trades" icon={LineChart} items={(recent.data?.trades ?? []).map((t: any) => ({ id: t.id, label: `${t.symbol} · ${t.pnl != null ? Number(t.pnl).toFixed(2) : "—"}` }))}
          onAttach={(t) => addMut.mutate({ ref_type: "trade", ref_id: t.id, title: t.label })} />
        <QuickList title="Journal" icon={BookOpen} items={(recent.data?.journals ?? []).map((j: any) => ({ id: j.id, label: `${j.symbol ?? "?"}` }))}
          onAttach={(t) => addMut.mutate({ ref_type: "journal", ref_id: t.id, title: t.label })} />
        <QuickList title="Replays" icon={Film} items={(recent.data?.replays ?? []).map((r: any) => ({ id: r.id, label: r.title }))}
          onAttach={(t) => addMut.mutate({ ref_type: "replay", ref_id: t.id, title: t.label })} />
      </div>

      <GlassCard className="p-4 space-y-2">
        <div className="text-sm font-semibold">Attached ({initial.length})</div>
        {initial.length === 0 ? (
          <div className="text-xs text-muted-foreground">No examples yet.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {initial.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{ex.ref_type}</div>
                  <div className="truncate text-sm">{ex.title ?? ex.description ?? ex.ref_id ?? "—"}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => delMut.mutate(ex.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function QuickList({ title, icon: Icon, items, onAttach }: { title: string; icon: any; items: { id: string; label: string }[]; onAttach: (item: { id: string; label: string }) => void }) {
  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{title}
      </div>
      {items.length === 0 ? <div className="text-xs text-muted-foreground/70">Nothing recent.</div> : (
        <ul className="space-y-1">
          {items.slice(0, 6).map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-xs">{it.label}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onAttach(it)}><Link className="h-3 w-3" /></Button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
