import { Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  { title: "AI Suggestions", desc: "Personalized tweaks to entries, exits and risk based on your trade outcomes." },
  { title: "Common Mistakes", desc: "Auto-detected patterns from your losing trades linked to this setup." },
  { title: "Improvement Opportunities", desc: "Weekly nudges highlighting the highest-impact fixes." },
  { title: "Similar Trades", desc: "Cluster analysis to compare this playbook to your winning setups." },
  { title: "Pattern Recognition", desc: "Automatic tagging of context (session, volatility, regime)." },
];

export function AiInsightsPlaceholder() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">AI Coaching for this playbook</div>
            <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">Coming soon</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Rules, checklists and trade outcomes on this page will feed a dedicated AI coach that reviews every setup.
            You don't need to do anything — as you journal and run replays, the data is being prepared.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="relative overflow-hidden rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-sm font-medium">{f.title}</div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
