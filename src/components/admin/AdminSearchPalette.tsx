import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { adminGlobalSearch } from "@/lib/admin/console.functions";

export function AdminSearchPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const searchFn = useServerFn(adminGlobalSearch);

  const mut = useMutation({
    mutationFn: (t: string) => searchFn({ data: { term: t } }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      if (term.trim().length >= 2) mut.mutate(term.trim());
    }, 240);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, open]);

  const go = (path: string) => {
    setOpen(false);
    setTerm("");
    navigate({ to: path });
  };

  const data = mut.data;
  const nothing = !data || (
    !data.users?.length &&
    !data.trades?.length &&
    !data.journal?.length &&
    !data.replays?.length &&
    !data.tickets?.length &&
    !data.bugs?.length
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        Search…
        <kbd className="ml-4 rounded border border-border/60 bg-surface px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden"
        aria-label="Admin search"
      >
        <Search className="h-4 w-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Search users, trades, journal, replays, tickets…"
        />
        <CommandList>
          {mut.isPending ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Searching…</div>
          ) : nothing ? (
            <CommandEmpty>{term.trim().length < 2 ? "Type at least 2 characters." : "No matches."}</CommandEmpty>
          ) : (
            <>
              {data!.users?.length ? (
                <CommandGroup heading="Users">
                  {data!.users.map((u: any) => (
                    <CommandItem key={`u-${u.id}`} onSelect={() => go(`/admin/users`)}>
                      <div className="flex flex-col">
                        <span>{u.display_name || u.username}</span>
                        <span className="text-[10px] text-muted-foreground">{u.email}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {data!.trades?.length ? (
                <CommandGroup heading="Trades">
                  {data!.trades.map((t: any) => (
                    <CommandItem key={`t-${t.id}`} onSelect={() => go(`/admin/trades`)}>
                      {t.symbol} · {t.status} · {t.pnl}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {data!.journal?.length ? (
                <CommandGroup heading="Journal">
                  {data!.journal.map((j: any) => (
                    <CommandItem key={`j-${j.id}`} onSelect={() => go(`/admin/journal`)}>
                      {j.symbol} · P/L {j.pnl}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {data!.replays?.length ? (
                <CommandGroup heading="Replay Sessions">
                  {data!.replays.map((r: any) => (
                    <CommandItem key={`r-${r.id}`} onSelect={() => go(`/replay/studio?id=${r.id}`)}>
                      {r.title || r.symbol}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {data!.tickets?.length ? (
                <CommandGroup heading="Support tickets">
                  {data!.tickets.map((s: any) => (
                    <CommandItem key={`s-${s.id}`} onSelect={() => go(`/admin/support`)}>
                      {s.subject} · {s.status}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {data!.bugs?.length ? (
                <CommandGroup heading="Bug reports">
                  {data!.bugs.map((b: any) => (
                    <CommandItem key={`b-${b.id}`} onSelect={() => go(`/admin/support`)}>
                      {b.title} · {b.status}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
