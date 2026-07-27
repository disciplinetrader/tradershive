import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookMarked, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listPlaybookLibrary } from "@/lib/playbook.functions";
import { ChecklistRunner } from "./ChecklistRunner";

/**
 * Compact button used inside Paper Trading OrderPanel and Replay HUD to
 * pick a playbook and run its pre-trade checklist.
 */
export function PlaybookQuickAttach({
  context,
  contextRefId,
  onFollowed,
}: {
  context: "paper" | "replay" | "journal";
  contextRefId?: string | null;
  onFollowed?: (strategyId: string) => void;
}) {
  const list = useServerFn(listPlaybookLibrary);
  const pbs = useQuery({
    queryKey: ["playbook-library", "quick"],
    queryFn: () => list({ data: {} }),
    staleTime: 60_000,
  });

  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <BookMarked className="h-3.5 w-3.5" /> Playbook
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Run checklist
          </DropdownMenuLabel>
          {pbs.isPending ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
          ) : (pbs.data ?? []).length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No playbooks yet.</div>
          ) : (
            (pbs.data as any[]).map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => setOpenId(p.id)}>
                <PlayCircle className="mr-2 h-3.5 w-3.5" />
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {openId ? (
        <ChecklistRunner
          strategyId={openId}
          open={!!openId}
          onOpenChange={(v) => !v && setOpenId(null)}
          context={context}
          contextRefId={contextRefId ?? null}
          onCompleted={(r) => { if (r.allRequiredPassed) onFollowed?.(openId); }}
        />
      ) : null}
    </>
  );
}
