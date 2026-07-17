import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { saveDashboardLayout } from "@/lib/dashboard.functions";
import { toast } from "sonner";

export type WidgetDef = { id: string; label: string; group: string };

export function CustomizeSheet({
  widgets,
  hidden,
  onChange,
}: {
  widgets: WidgetDef[];
  hidden: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveDashboardLayout);
  const saveMut = useMutation({
    mutationFn: (v: { hidden: string[]; collapsed: string[] }) => save({ data: v }),
    onSuccess: () => {
      toast.success("Layout saved");
      qc.invalidateQueries({ queryKey: ["dashboard_layout"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? "Could not save"),
  });

  const grouped = widgets.reduce<Record<string, WidgetDef[]>>((acc, w) => {
    (acc[w.group] ??= []).push(w);
    return acc;
  }, {});

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="glass">
          <Settings2 className="mr-2 h-4 w-4" /> Customize
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Customize dashboard</SheetTitle>
          <SheetDescription>Toggle widgets on or off. Your layout is saved to your account.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
              <div className="space-y-2">
                {list.map((w) => {
                  const visible = !hidden.has(w.id);
                  return (
                    <div key={w.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-surface/40 px-3 py-2">
                      <Label htmlFor={`w-${w.id}`} className="cursor-pointer text-sm">{w.label}</Label>
                      <Switch
                        id={`w-${w.id}`}
                        checked={visible}
                        onCheckedChange={(v) => {
                          const next = new Set(hidden);
                          if (v) next.delete(w.id);
                          else next.add(w.id);
                          onChange(next);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <Button
            className="gradient-primary text-primary-foreground"
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate({ hidden: Array.from(hidden), collapsed: [] })}
          >
            Save layout
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onChange(new Set());
              saveMut.mutate({ hidden: [], collapsed: [] });
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
