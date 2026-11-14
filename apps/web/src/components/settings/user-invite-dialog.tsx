"use client";

import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button, Notice, TextField } from "@/components/cv";

/**
 * Invite a user — the dialog on board "Settings: users", re-skinned onto the
 * design system: `TextField` for Name and Email, a labelled select for Role,
 * and the result as a `Notice` rather than a shadcn `Alert`.
 *
 * The validation, the 1s wait, the `onInvite` call and the 1.5s auto-close are
 * the ones that were here. So is the fact that **nothing is sent**: `onInvite`
 * pushes a row onto the Users page's `useState` fixture, and no mail, no
 * `users` row and no Clerk invitation follows it. The copy below therefore says
 * what it does rather than promising delivery.
 *
 * The role hints are unchanged, because they are accurate: Admin and Manager
 * are `EDITOR_ROLES`, so both may upload and change company-wide settings, and
 * a Viewer is read-only. "Read-only access to comparisons" is also the whole
 * truth — a viewer does see the Dashboard and Detailed View, both of which name
 * individuals and their pay.
 */

interface UserInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (name: string, email: string, role: string) => void;
}

const ROLE_HINTS: Record<string, string> = {
  admin: "Full access to all settings and data",
  manager: "Can upload and compare payroll data",
  viewer: "Read-only access to comparisons",
};

export function UserInviteDialog({ open, onOpenChange, onInvite }: UserInviteDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);
  const roleId = useId();

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Valid email is required");
      return;
    }

    setSending(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSending(false);

    onInvite(name.trim(), email.trim(), role);
    setSuccess(true);
    setName("");
    setEmail("");
    setRole("viewer");

    setTimeout(() => {
      onOpenChange(false);
      setSuccess(false);
    }, 1500);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setEmail("");
      setRole("viewer");
      setError(null);
      setSuccess(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>
            They are added to this company with the role you choose.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <Notice tone="success" title="Invitation sent">
            They appear in the users list as Invited.
          </Notice>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {error && <Notice tone="danger">{error}</Notice>}

            <TextField
              label="Name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Email"
              type="email"
              placeholder="john@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="flex min-w-0 flex-col gap-1.5">
              <label
                htmlFor={roleId}
                className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
              >
                Role
              </label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id={roleId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
                {ROLE_HINTS[role]}
              </p>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={sending} loading={sending}>
                {sending ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
