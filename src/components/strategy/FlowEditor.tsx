import { useCallback, useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Plus, ArrowRight, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { getFlow, saveFlow } from "@/lib/strategy.functions";
import { cn } from "@/lib/utils";

type Node = { id: string; node_type: string; label: string | null; pos_x: number; pos_y: number; data?: any };
type Edge = { id?: string; source_id: string; target_id: string; label?: string | null };

const NODE_TYPES = [
  { id: "condition", label: "Condition", color: "#3b82f6" },
  { id: "entry", label: "Entry", color: "#22c55e" },
  { id: "exit", label: "Exit", color: "#ef4444" },
  { id: "management", label: "Manage", color: "#eab308" },
  { id: "outcome", label: "Outcome", color: "#a855f7" },
];

/** Lightweight visual flow editor (no external deps) with drag-and-drop nodes and click-to-connect. */
export function FlowEditor({ strategyId }: { strategyId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getFlow);
  const save = useServerFn(saveFlow);
  const q = useQuery({ queryKey: ["strategy", strategyId, "flow"], queryFn: () => load({ data: { strategy_id: strategyId } }) });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [connect, setConnect] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.data) return;
    setNodes((q.data as any).nodes ?? []);
    setEdges((q.data as any).edges ?? []);
  }, [q.data]);

  const addNode = (type: string) => {
    const id = crypto.randomUUID();
    setNodes((p) => [...p, { id, node_type: type, label: type, pos_x: 40 + p.length * 30, pos_y: 40 + p.length * 40 }]);
  };

  const onMouseDown = (e: React.MouseEvent, id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    setDrag({ id, ox: e.clientX - n.pos_x, oy: e.clientY - n.pos_y });
  };
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag) return;
    setNodes((prev) => prev.map((n) => n.id === drag.id ? { ...n, pos_x: e.clientX - drag.ox, pos_y: e.clientY - drag.oy } : n));
  }, [drag]);
  const onMouseUp = useCallback(() => setDrag(null), []);
  useEffect(() => {
    if (!drag) return;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [drag, onMouseMove, onMouseUp]);

  const linkClick = (id: string) => {
    if (connect === null) setConnect(id);
    else if (connect === id) setConnect(null);
    else {
      setEdges((p) => [...p, { source_id: connect, target_id: id }]);
      setConnect(null);
    }
  };

  const removeNode = (id: string) => {
    setNodes((p) => p.filter((n) => n.id !== id));
    setEdges((p) => p.filter((e) => e.source_id !== id && e.target_id !== id));
  };

  const mut = useMutation({
    mutationFn: async () => save({ data: { strategy_id: strategyId, nodes, edges } }),
    onSuccess: () => { toast.success("Flow saved"); qc.invalidateQueries({ queryKey: ["strategy", strategyId, "flow"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {NODE_TYPES.map((t) => (
          <Button key={t.id} size="sm" variant="secondary" onClick={() => addNode(t.id)}>
            <Plus className="mr-1 h-3.5 w-3.5" style={{ color: t.color }} />{t.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {connect ? <span className="text-primary">Click a target node to connect…</span> : null}
          <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}><Save className="mr-1 h-3.5 w-3.5" />Save Flow</Button>
        </div>
      </div>
      <div ref={canvas} className="relative h-[420px] w-full overflow-hidden rounded-lg border border-border/60 bg-background/40">
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((e, i) => {
            const s = nodes.find((n) => n.id === e.source_id);
            const t = nodes.find((n) => n.id === e.target_id);
            if (!s || !t) return null;
            const x1 = s.pos_x + 80, y1 = s.pos_y + 24;
            const x2 = t.pos_x, y2 = t.pos_y + 24;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--primary)" strokeWidth={2} strokeOpacity={0.6} markerEnd="url(#arr)" />;
          })}
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
            </marker>
          </defs>
        </svg>
        {nodes.map((n) => {
          const color = NODE_TYPES.find((t) => t.id === n.node_type)?.color ?? "#3b82f6";
          return (
            <motion.div
              key={n.id}
              onMouseDown={(e) => onMouseDown(e, n.id)}
              style={{ left: n.pos_x, top: n.pos_y, borderColor: color }}
              className={cn("absolute w-40 rounded-lg border-2 bg-background/80 backdrop-blur px-2 py-2 shadow-md cursor-grab active:cursor-grabbing",
                connect === n.id ? "ring-2 ring-primary" : "")}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider" style={{ color }}>
                {n.node_type}
                <button onClick={(e) => { e.stopPropagation(); removeNode(n.id); }} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3 w-3" /></button>
              </div>
              <input value={n.label ?? ""} onChange={(e) => setNodes((p) => p.map((x) => x.id === n.id ? { ...x, label: e.target.value } : x))}
                onMouseDown={(e) => e.stopPropagation()}
                className="mt-1 w-full bg-transparent text-sm outline-none" placeholder="Label" />
              <button onClick={(e) => { e.stopPropagation(); linkClick(n.id); }} className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline">
                <ArrowRight className="h-3 w-3" />{connect === n.id ? "cancel" : "connect"}
              </button>
            </motion.div>
          );
        })}
        {nodes.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Add nodes to visualize your strategy decision tree.
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
