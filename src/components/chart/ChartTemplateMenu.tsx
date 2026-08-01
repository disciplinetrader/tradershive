/**
 * Chart templates menu — save the current chart configuration (type,
 * indicators, inputs, SMC) and re-apply it in one click.
 */
import { useEffect, useState } from "react";
import { LayoutTemplate, ChevronDown, Check, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  BUILT_IN_TEMPLATES, deleteTemplate, listTemplates, saveTemplate,
  type ChartTemplate,
} from "@/lib/chart/templates";

interface Props {
  current: Omit<ChartTemplate, "id" | "name" | "updatedAt">;
  activeId: string | null;
  onApply: (t: ChartTemplate) => void;
}

export function ChartTemplateMenu({ current, activeId, onApply }: Props) {
  const [rows, setRows] = useState<ChartTemplate[]>([]);
  const [name, setName] = useState("");

  useEffect(() => { setRows(listTemplates()); }, []);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setRows(saveTemplate({ ...current, name: trimmed }));
    setName("");
    toast.success(`Template "${trimmed}" saved`);
  };

  const remove = (t: ChartTemplate) => {
    setRows(deleteTemplate(t.id));
    toast.success(`Template "${t.name}" deleted`);
  };

  const all = [...BUILT_IN_TEMPLATES, ...rows];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
          <LayoutTemplate className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Templates</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Chart Templates
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {all.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => { onApply(t); toast.success(`Applied "${t.name}"`); }}
            className="group text-xs"
          >
            <span className="flex-1 truncate">{t.name}</span>
            {t.builtIn && <span className="mr-1 text-[9px] uppercase text-muted-foreground">preset</span>}
            {activeId === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
            {!t.builtIn && (
              <button
                aria-label={`Delete ${t.name}`}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); remove(t); }}
                className="ml-1 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="flex items-center gap-1.5 p-1.5" onKeyDown={(e) => e.stopPropagation()}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Save current as…"
            className="h-7 text-xs"
          />
          <Button size="sm" className="h-7 px-2" onClick={save} disabled={!name.trim()} aria-label="Save template">
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
