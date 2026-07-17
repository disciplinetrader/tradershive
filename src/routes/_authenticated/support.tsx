import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LifeBuoy, Mail, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — TradersHIVE Arena" }] }),
  component: SupportPage,
});

const FAQ = [
  {
    q: "Is TradersHIVE Arena free?",
    a: "Yes — training, journaling, and leaderboards are free forever. Elite challenges and prop-firm scoring are part of the Premium plan.",
  },
  {
    q: "Does paper trading use real market data?",
    a: "Yes. Prices, spreads, and volatility come from the same sources professional platforms use.",
  },
  {
    q: "How is XP earned?",
    a: "Complete challenges, journal trades, maintain your streak, and win league promotions.",
  },
  {
    q: "Can I reset my account?",
    a: "You can reset your paper-trading equity from Settings. Journal entries and stats are preserved.",
  },
];

function SupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="We&apos;re here to help. Reach out anytime."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: MessageCircle, title: "Live chat", desc: "Average reply < 5 min" },
          { icon: Mail, title: "Email us", desc: "support@tradershive.io" },
          { icon: LifeBuoy, title: "Help center", desc: "Guides & tutorials" },
        ].map((c) => (
          <GlassCard key={c.title} className="hover-lift p-6">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <c.icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">{c.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
            <Button size="sm" variant="outline" className="mt-4 glass">
              Open
            </Button>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold">FAQ</h2>
        <Accordion type="single" collapsible className="mt-2">
          {FAQ.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </GlassCard>
    </div>
  );
}
