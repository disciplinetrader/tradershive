import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { joinByInviteCode } from "@/lib/battle-arena.functions";

export function JoinByCodeDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const fn = useServerFn(joinByInviteCode);

  const submit = async () => {
    if (code.trim().length < 4) return toast.error("Enter a valid code");
    setLoading(true);
    try {
      const { battleId } = await fn({ data: { code: code.trim() } });
      toast.success("Joined!");
      setOpen(false);
      navigate({ to: "/battle-arena/$battleId", params: { battleId } });
    } catch (e: any) { toast.error(e?.message ?? "Failed to join"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><KeyRound className="mr-1.5 h-4 w-4" />Join by code</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Join a private battle</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="INVITE CODE" className="font-mono text-lg tracking-widest" />
          <Button className="w-full" disabled={loading} onClick={submit}>{loading ? "Joining…" : "Join battle"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
