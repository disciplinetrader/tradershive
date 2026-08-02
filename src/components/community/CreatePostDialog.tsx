import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PostComposer } from "@/components/community/PostComposer";

/**
 * Familiar "Create post" modal — the same entry point every social app uses,
 * reachable from the nav rail, the feed composer and the mobile FAB.
 */
export function CreatePostDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create post</DialogTitle>
        </DialogHeader>
        <PostComposer bare onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
