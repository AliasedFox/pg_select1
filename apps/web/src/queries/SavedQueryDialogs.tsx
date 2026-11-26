import type { Me, QueryScope, SavedQuery } from "@pg_select1/shared";
import { type MouseEvent, type SubmitEvent, useId, useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/connections/ConnectionForm";
import { describeError } from "@/lib/api";

import { createSavedQuery, deleteSavedQuery, updateSavedQuery } from "./api";

/** Says who sees a saved query: a yellow dot for one shared with everyone. */
export function ScopeBadge({ scope }: { scope: QueryScope }) {
  return scope === "global" ? (
    <Badge variant="outline">
      <span className="size-1.5 rounded-full bg-highlight" aria-hidden />
      global
    </Badge>
  ) : (
    <Badge variant="secondary">personal</Badge>
  );
}

interface Fields {
  name: string;
  description: string;
  scope: QueryScope;
}

// A saved query's name, description and who sees it. `canShare` is false for a viewer, who
// can make a global query personal but not the other way round; without `showScope`, as for
// someone else's query, who sees it isn't shown at all.
function SavedQueryForm({
  initial,
  canShare,
  showScope,
  label,
  submitLabel,
  onSubmit,
}: {
  initial: Fields;
  canShare: boolean;
  showScope: boolean;
  label: string;
  submitLabel: string;
  onSubmit: (fields: Fields) => Promise<void>;
}) {
  const id = useId();
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(fields);
    } catch (failure) {
      setError(describeError(failure));
      setBusy(false);
    }
  }

  const shared = fields.scope === "global";
  return (
    <form aria-label={label} className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          required
          autoComplete="off"
          maxLength={200}
          value={fields.name}
          onChange={(e) => {
            setFields({ ...fields, name: e.target.value });
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          maxLength={2000}
          placeholder="Optional: what it answers, and when to run it"
          value={fields.description}
          onChange={(e) => {
            setFields({ ...fields, description: e.target.value });
          }}
        />
      </div>
      {showScope && (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="grid gap-1">
            <Label htmlFor={`${id}-scope`}>Share with everyone</Label>
            <p className="text-xs text-muted-foreground">
              {!canShare && !shared
                ? "Only editors and admins can share queries with everyone."
                : shared
                  ? "Everyone signed in sees it, and editors and admins can change it."
                  : "Only you see it."}
            </p>
          </div>
          <Switch
            id={`${id}-scope`}
            checked={shared}
            disabled={!canShare && !shared}
            onCheckedChange={(checked) => {
              setFields({ ...fields, scope: checked ? "global" : "personal" });
            }}
          />
        </div>
      )}
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * Saves the explorer's SQL as a new query on its connection, asking for a name, a description
 * and who sees it, then hands the saved query to `onSaved` and closes.
 */
export function SaveQueryDialog({
  user,
  sql,
  connectionId,
  initialName = "",
  onOpenChange,
  onSaved,
}: {
  user: Me;
  sql: string;
  connectionId: string;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (query: SavedQuery) => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save query</DialogTitle>
          <DialogDescription>
            Saved with its SQL and database, to open in the explorer and run again.
          </DialogDescription>
        </DialogHeader>
        <SavedQueryForm
          initial={{ name: initialName, description: "", scope: "personal" }}
          canShare={user.role !== "viewer"}
          showScope
          label="Save query"
          submitLabel="Save"
          onSubmit={async ({ name, description, scope }) => {
            const saved = await createSavedQuery({
              name,
              description,
              scope,
              sql,
              connectionIds: [connectionId],
            });
            onSaved(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Changes a saved query's name, description and, for its owner, who sees it, then hands the
 * changed query to `onSaved` and closes. Its SQL and database are changed in the explorer.
 */
export function EditSavedQueryDialog({
  user,
  query,
  onOpenChange,
  onSaved,
}: {
  user: Me;
  query: SavedQuery;
  onOpenChange: (open: boolean) => void;
  onSaved: (query: SavedQuery) => void;
}) {
  const title = `Edit ${query.name}`;
  const isOwner = query.owner?.id === user.id;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Open it in the explorer to change its SQL or database.
          </DialogDescription>
        </DialogHeader>
        <SavedQueryForm
          initial={{
            name: query.name,
            description: query.description ?? "",
            scope: query.scope,
          }}
          canShare={user.role !== "viewer"}
          showScope={isOwner}
          label={title}
          submitLabel="Save"
          onSubmit={async ({ name, description, scope }) => {
            const saved = await updateSavedQuery(query.id, {
              name,
              description,
              ...(isOwner && { scope }),
            });
            onSaved(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Asks before deleting a saved query, then hands its id to `onDeleted`. */
export function DeleteSavedQueryDialog({
  query,
  onOpenChange,
  onDeleted,
}: {
  query: SavedQuery;
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
      await deleteSavedQuery(query.id);
      onDeleted(query.id);
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
          <AlertDialogTitle>Delete {query.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {query.scope === "global"
              ? "It's gone for everyone it's shared with. Its database isn't touched."
              : "Its SQL is gone. Its database isn't touched."}
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
