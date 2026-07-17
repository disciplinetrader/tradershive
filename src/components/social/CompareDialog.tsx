import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Swords } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { compareTraders } from "@/lib/social.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CompareDialog({ initialUsername, children }: { initialUsername?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(initialUsername ?? "");
  const [b, setB] = useState("");
  const fn = useServerFn(compareTraders);
  const mut = useMutation({
    mutationFn: () => fn({ data: { a, b } }),
    onError: (e: any) => toast.error(e?.message ?? "Compare failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm">
            <Swords className="mr-1.5 h-3.5 w-3.5" /> Compare
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compare traders</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Trader A username</Label>
            <Input className="mt-1" value={a} onChange={(e) => setA(e.target.value)} placeholder="username" />
          </div>
          <div>
            <Label className="text-xs">Trader B username</Label>
            <Input className="mt-1" value={b} onChange={(e) => setB(e.target.value)} placeholder="username" />
          </div>
        </div>
        <Button onClick={() => mut.mutate()} disabled={!a || !b || mut.isPending} className="w-full">
          {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Compare
        </Button>

        {mut.data ? (
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-surface/40 p-3 text-xs">
            <div />
            {mut.data.map((r: any) => (
              <div key={r.profile.id} className="text-center">
                <Avatar className="mx-auto h-10 w-10">
                  <AvatarImage src={r.profile.avatar_url ?? undefined} />
                  <AvatarFallback>{r.profile.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="mt-1 font-semibold">{r.profile.display_name || r.profile.username}</div>
              </div>
            ))}
            {[
              { label: "XP", get: (r: any) => r.profile.xp.toLocaleString() },
              { label: "Level", get: (r: any) => r.profile.level },
              { label: "League", get: (r: any) => r.profile.league },
              { label: "Streak", get: (r: any) => r.profile.streak + "d" },
              { label: "Trades", get: (r: any) => r.stats?.totalTrades ?? 0 },
              { label: "Win %", get: (r: any) => ((r.stats?.winRate ?? 0) * 100).toFixed(0) + "%" },
              { label: "Profit Factor", get: (r: any) => (r.stats?.profitFactor ?? 0).toFixed(2) },
              { label: "Net R", get: (r: any) => (r.stats?.netR ?? 0).toFixed(1) + "R" },
              { label: "Profit", get: (r: any) => "$" + Math.round(r.stats?.profit ?? 0).toLocaleString() },
              { label: "Achievements", get: (r: any) => r.stats?.achievements ?? 0 },
            ].map((row) => {
              const values = mut.data!.map(row.get);
              return (
                <>
                  <div key={row.label + "l"} className="text-muted-foreground">{row.label}</div>
                  {values.map((v: any, i: number) => (
                    <div key={row.label + i} className={cn("text-center font-mono font-semibold",
                      values.length === 2 && v === values[i] && String(v) > String(values[1 - i]) && "text-emerald-400",
                    )}>{v}</div>
                  ))}
                </>
              );
            })}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
