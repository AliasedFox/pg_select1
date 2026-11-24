import type { Connection } from "@pg_select1/shared";
import { type MouseEvent, useState } from "react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { describeError } from "@/lib/api";

import { deleteConnection } from "./api";
import { ConnectionForm, FormError } from "./ConnectionForm";

/** Changes a connection in a dialog, handing the saved one to `onSaved` and closing. */
export function EditConnectionDialog({
  connection,
  onOpenChange,
  onSaved,
}: {
  connection: Connection;
  onOpenChange: (open: boolean) => void;
  onSaved: (connection: Connection) => void;
}) {
  const title = `Edit ${connection.name}`;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Leave the password blank to keep the saved one: nobody can see it again once it's saved.
          </DialogDescription>
        </DialogHeader>
        <ConnectionForm
          connection={connection}
          label={title}
          onSaved={(saved) => {
            onSaved(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Asks before deleting a connection, then hands its id to `onDeleted`. */
export function DeleteConnectionDialog({
  connection,
  onOpenChange,
  onDeleted,
}: {
  connection: Connection;
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
      await deleteConnection(connection.id);
      onDeleted(connection.id);
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
          <AlertDialogTitle>Delete {connection.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            pg_select1 forgets where {connection.database} is and its password. The database itself
            isn't touched.
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
