import { type Role, role, roles, type SetPasswordLink, type User } from "@pg_select1/shared";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type MouseEvent, type SubmitEvent, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { describeError } from "@/lib/api";

import { deleteUser, inviteUser, updateUser } from "./api";

// What each role may do, for the role picker.
const roleDescriptions: Record<Role, string> = {
  admin: "Manages users and everything else",
  editor: "Explores, and will edit queries and alerts",
  viewer: "Explores, and will see queries and alerts",
};

function RoleField({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="role">Role</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          onChange(role.parse(next));
        }}
      >
        <SelectTrigger id="role" className="w-full capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((option) => (
            <SelectItem key={option} value={option} className="capitalize">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{roleDescriptions[value]}</p>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="animate-fade-in text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Invites someone by email, name and role, then hands the new user and their link to
 * `onInvited`, which shows the link: pg_select1 doesn't send email.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (user: User, link: SetPasswordLink) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset(nextOpen: boolean) {
    if (!nextOpen) {
      setEmail("");
      setName("");
      setNewRole("viewer");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user, link } = await inviteUser({ email, name, role: newRole });
      reset(false);
      onInvited(user, link);
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              You'll get a link to send them, where they set their password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </div>
          <RoleField value={newRole} onChange={setNewRole} />
          <FormError message={error} />
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Inviting…" : "Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Changes a user's name and role, handing the changed user to `onSaved`. */
export function EditUserDialog({
  user,
  onOpenChange,
  onSaved,
}: {
  user: User;
  onOpenChange: (open: boolean) => void;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState(user.name);
  const [newRole, setNewRole] = useState<Role>(user.role);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateUser(user.id, { name, role: newRole }));
      onOpenChange(false);
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Edit {user.email}</DialogTitle>
            <DialogDescription>A new role applies from their next request.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </div>
          <RoleField value={newRole} onChange={setNewRole} />
          <FormError message={error} />
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shows a set-password link to copy and send, since pg_select1 doesn't send email. */
export function SetPasswordLinkDialog({
  user,
  link,
  onOpenChange,
}: {
  user: User;
  link: SetPasswordLink;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const invited = user.status === "invited";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Without clipboard access the link is still there to select and copy by hand.
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {invited ? `Invite link for ${user.email}` : `Password link for ${user.email}`}
          </DialogTitle>
          <DialogDescription>
            Send it to them yourself. It works once, until{" "}
            {new Date(link.expiresAt).toLocaleString()}, and any earlier link for them has stopped
            working.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            aria-label="Link"
            value={link.url}
            onFocus={(e) => {
              e.target.select();
            }}
            className="font-mono text-xs"
          />
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asks before deleting a user, then hands their id to `onDeleted`. */
export function DeleteUserDialog({
  user,
  onOpenChange,
  onDeleted,
}: {
  user: User;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onConfirm(event: MouseEvent) {
    // Keep the dialog open until the API answers, to show an error if it refuses.
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await deleteUser(user.id);
      onDeleted(user.id);
      onOpenChange(false);
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            They're signed out everywhere and can't sign in again unless you invite them again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={busy}
            onClick={(event) => void onConfirm(event)}
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
