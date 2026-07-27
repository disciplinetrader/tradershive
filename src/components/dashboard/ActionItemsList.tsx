import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeActionItem } from "@/lib/dashboard-home.functions";

type Props = { items: HomeActionItem[] };

const TONE = {
  info: { ring: "border-info/30", bg: "bg-info/10", text: "text-info", Icon: Info },
  warning: { ring: "border-warning/30", bg: "bg-warning/10", text: "text-warning", Icon: AlertTriangle },
  critical: { ring: "border-danger/40", bg: "bg-danger/10", text: "text-danger", Icon: ShieldAlert },
} as const;

/**
 * Section 3 — Action Items.
 * Answers: "What needs attention?" Each item is actionable and deep-links.
 */
export function ActionItemsList({ items }: Props) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Action items</h2>
        <p className="text-[11px] text-muted-foreground/80">Loose ends worth closing before your next trade.</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 bg-card/40 p-8 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-success/15 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold">Inbox zero</p>
          <p className="text-xs text-muted-foreground">Nothing to fix right now. Trade clean.</p>
        </div>
      ) : (
        <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }} className="grid gap-3 md:grid-cols-2">
          {items.map((it) => {
            const t = TONE[it.severity];
            return (
              <motion.li
                key={it.id}
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                className={cn("flex items-start gap-3 rounded-2xl border bg-card/60 p-4 transition hover:bg-card/80", t.ring)}
              >
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", t.bg, t.text)}>
                  <t.Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{it.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{it.detail}</p>
                </div>
                <Link
                  to={it.href}
                  className="inline-flex shrink-0 items-center gap-1 self-center rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs font-semibold transition hover:border-primary/50 hover:text-primary"
                >
                  {it.cta} <ArrowRight className="h-3 w-3" />
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </section>
  );
}
