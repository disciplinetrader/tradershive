/**
 * Playbook section — which playbook this trade belongs to and, rule by rule,
 * whether it was followed. The system proposes a verdict from checklist data;
 * the trader can override it and attach evidence.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_CHECKLIST } from "@/lib/journal/constants";
import { readPlaybookReview, type PlaybookReview, type RuleState } from "@/lib/journal/editor/model";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTradeEditorContext } from "../TradeEditorProvider";
import { SelectField, SubHeading, TextAreaField } from "../fields";

type Rule = { id: string; label: string };

const STATES: { value: RuleState; label: string; icon: typeof Check; cls: string }[] = [
  { value: "followed", label: "Followed", icon: Check, cls: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" },
  { value: "missed", label: "Missed", icon: Minus, cls: "border-amber-400/50 bg-amber-400/10 text-amber-300" },
  { value: "broken", label: "Broken", icon: X, cls: "border-rose-400/50 bg-rose-400/10 text-rose-300" },
];

export function PlaybookSection() {
  const { entry, setField } = useTradeEditorContext();
  const { user } = useAuth();
  const review = useMemo(() => readPlaybookReview(entry), [entry]);

  const playbooks = useQuery({
    queryKey: ["journal", "playbooks", user?.id],
    enabled: Boolean(user),
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // Rules: prefer the entry's own checklist, else the default process rules.
  const rules: Rule[] = useMemo(() => {
    const raw = entry.checklist;
    if (Array.isArray(raw)) {
      const mapped = raw
        .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
        .filter(Boolean)
        .map((r) => ({ id: String(r!.id ?? r!.label), label: String(r!.label ?? r!.id) }));
      if (mapped.length) return mapped;
    }
    return DEFAULT_CHECKLIST;
  }, [entry.checklist]);

  /** System verdict from the stored checklist state, before any override. */
  const systemVerdict = (id: string): RuleState => {
    const raw = entry.checklist;
    if (Array.isArray(raw)) {
      const hit = raw.find(
        (r) => r && typeof r === "object" && String((r as Record<string, unknown>).id) === id,
      ) as Record<string, unknown> | undefined;
      if (hit) return hit.checked ? "followed" : "missed";
    }
    return "missed";
  };

  const write = (patch: Partial<PlaybookReview>) => {
    setField({ playbook_review: { ...review, ...patch } as never });
  };

  const setVerdict = (id: string, state: RuleState) => {
    write({ overrides: { ...(review.overrides ?? {}), [id]: state } });
  };

  const verdictOf = (id: string): RuleState => review.overrides?.[id] ?? systemVerdict(id);

  const followed = rules.filter((r) => verdictOf(r.id) === "followed").length;
  const adherence = rules.length ? Math.round((followed / rules.length) * 100) : null;

  return (
    <div className="space-y-3">
      <SelectField
        label="Playbook"
        value={review.playbook ?? entry.strategy_id ?? null}
        options={(playbooks.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        placeholder={playbooks.isLoading ? "Loading…" : "No playbook linked"}
        onCommit={(v) => { write({ playbook: v }); setField({ strategy_id: v }); }}
      />

      <div className="flex items-center justify-between rounded border border-border/50 bg-muted/5 px-2.5 py-1.5">
        <SubHeading>Rule adherence</SubHeading>
        <span className="font-mono text-[12px] tabular-nums text-foreground">
          {adherence == null ? "—" : `${adherence}%`}{" "}
          <span className="text-muted-foreground">({followed}/{rules.length})</span>
        </span>
      </div>

      <div className="space-y-1.5">
        {rules.map((r) => {
          const v = verdictOf(r.id);
          const overridden = review.overrides?.[r.id] != null && review.overrides[r.id] !== systemVerdict(r.id);
          return (
            <div key={r.id} className="rounded border border-border/50 bg-muted/5 px-2.5 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-foreground">
                  {r.label}
                  {overridden ? (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">(your verdict)</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1">
                  {STATES.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        aria-label={`${r.label}: ${s.label}`}
                        aria-pressed={v === s.value}
                        onClick={() => setVerdict(r.id, s.value)}
                        className={cn(
                          "flex h-6 items-center gap-1 rounded border px-1.5 text-[10px] transition",
                          v === s.value ? s.cls : "border-border/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {v !== "followed" ? (
                <div className="mt-1.5">
                  <TextAreaField
                    label="Why"
                    rows={1}
                    value={review.evidence?.[r.id] ?? ""}
                    placeholder="What happened instead."
                    onCommit={(text) => write({ evidence: { ...(review.evidence ?? {}), [r.id]: text } })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded border border-border/50 bg-muted/5 px-2.5 py-2">
        <div>
          <Label className="text-[11px] font-medium">Use as a playbook example</Label>
          <p className="text-[10px] text-muted-foreground">
            Pinned to the playbook page as a reference execution.
          </p>
        </div>
        <Switch
          checked={Boolean(review.isExample)}
          onCheckedChange={(v) => write({ isExample: v })}
          aria-label="Use as playbook example"
        />
      </div>
    </div>
  );
}
