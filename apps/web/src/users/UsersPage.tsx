import type { SetPasswordLink, User } from "@pg_select1/shared";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeError } from "@/lib/api";

import { createSetPasswordLink, fetchUsers } from "./api";
import {
  DeleteUserDialog,
  EditUserDialog,
  InviteUserDialog,
  SetPasswordLinkDialog,
} from "./UserDialogs";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; users: User[] }
  | { kind: "failed"; message: string };

// The one dialog open at a time, besides the invite form.
type Open =
  | { kind: "none" }
  | { kind: "edit"; user: User }
  | { kind: "delete"; user: User }
  | { kind: "link"; user: User; link: SetPasswordLink };

/**
 * Lists every user for an admin, to invite people, change their name and role, make a new
 * set-password link, and delete them. `currentUserId` is the admin looking, who can't delete
 * themselves.
 */
export function UsersPage({ currentUserId }: { currentUserId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState<Open>({ kind: "none" });
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsers().then(
      (users) => {
        if (!cancelled) setState({ kind: "loaded", users });
      },
      (error: unknown) => {
        if (!cancelled) setState({ kind: "failed", message: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function changeUsers(change: (users: User[]) => User[]) {
    setState((current) =>
      current.kind === "loaded" ? { kind: "loaded", users: change(current.users) } : current,
    );
  }

  async function newLink(user: User) {
    setActionError(null);
    try {
      setOpen({ kind: "link", user, link: await createSetPasswordLink(user.id) });
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) setOpen({ kind: "none" });
  };

  return (
    <div className="grid w-full max-w-4xl gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Invite people to pg_select1 and choose what they can do.
          </p>
        </div>
        <Button
          onClick={() => {
            setInviting(true);
          }}
        >
          <PlusIcon />
          Invite user
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state.kind === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load users: {state.message}
        </p>
      )}
      {state.kind === "loaded" && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.name}
                    {user.id === currentUserId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="capitalize">{user.role}</TableCell>
                  <TableCell>
                    {user.status === "invited" ? (
                      <Badge className="bg-highlight text-highlight-foreground">invited</Badge>
                    ) : (
                      <Badge variant="outline">active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${user.email}`}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setOpen({ kind: "edit", user });
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void newLink(user)}>
                          {user.status === "invited" ? "New invite link" : "New password link"}
                        </DropdownMenuItem>
                        {user.id !== currentUserId && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => {
                                setOpen({ kind: "delete", user });
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <InviteUserDialog
        open={inviting}
        onOpenChange={setInviting}
        onInvited={(user, link) => {
          changeUsers((users) => [...users, user]);
          setOpen({ kind: "link", user, link });
        }}
      />
      {open.kind === "edit" && (
        <EditUserDialog
          user={open.user}
          onOpenChange={closeDialog}
          onSaved={(saved) => {
            changeUsers((users) => users.map((u) => (u.id === saved.id ? saved : u)));
          }}
        />
      )}
      {open.kind === "delete" && (
        <DeleteUserDialog
          user={open.user}
          onOpenChange={closeDialog}
          onDeleted={(id) => {
            changeUsers((users) => users.filter((u) => u.id !== id));
          }}
        />
      )}
      {open.kind === "link" && (
        <SetPasswordLinkDialog user={open.user} link={open.link} onOpenChange={closeDialog} />
      )}
    </div>
  );
}
