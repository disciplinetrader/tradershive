import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DeleteAccountDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Account</DialogTitle>
        </DialogHeader>
        <div className="py-4 text-sm text-muted-foreground">
          Are you sure you want to delete your account? This action is permanent.
        </div>
      </DialogContent>
    </Dialog>
  );
}
