import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { validatePasswordClient } from "@/lib/validation";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const err = validatePasswordClient(next);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      await apiPost("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      toast.success("Password changed. Please sign in again.");
      onOpenChange(false);
      setCurrent("");
      setNext("");
      qc.clear();
      window.location.href = "/login";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-current">Current password</Label>
            <Input
              id="cp-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              data-testid="change-password-current-input"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-new">New password</Label>
            <Input
              id="cp-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              data-testid="change-password-new-input"
            />
            <p className="text-xs text-slate-500">
              At least 9 characters with an uppercase letter, a lowercase letter and a special
              character.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} data-testid="change-password-submit-button">
            {busy ? "Saving…" : "Change password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
