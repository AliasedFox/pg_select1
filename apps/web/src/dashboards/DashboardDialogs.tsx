import {
  type Dashboard,
  type DashboardSummary,
  type DashboardVisualization,
  dashboardVisualization,
  dashboardVisualizations,
  type Me,
  type QueryScope,
  type SavedQuery,
} from "@pg_select1/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/connections/ConnectionForm";
import { describeError } from "@/lib/api";
import { useLoaded } from "@/lib/loaded";
import { fetchSavedQueries } from "@/queries/api";

import { createDashboard, deleteDashboard, updateDashboard } from "./api";

// What each way of showing a query is called.
const visualizationLabels: Record<DashboardVisualization, string> = { table: "Table" };

interface Fields {
  name: string;
  description: string;
  scope: QueryScope;
}

// A dashboard's title, description and who sees it, as a saved query's are: `canShare` is false
// for a viewer, and without `showScope`, as for someone else's dashboard, who sees it isn't shown.
function DashboardForm({
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
        <Label htmlFor={`${id}-name`}>Title</Label>
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
          placeholder="Optional: what it shows, and who it's for"
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
                ? "Only editors and admins can share dashboards with everyone."
                : shared
                  ? "Everyone signed in sees it, and editors and admins can change it. They see only the queries on it that they can see."
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
 * Makes a dashboard, asking for its title, a description and who sees it, then hands it to
 * `onCreated` and closes. Its queries are added on its own page.
 */
export function NewDashboardDialog({
  user,
  onOpenChange,
  onCreated,
}: {
  user: Me;
  onOpenChange: (open: boolean) => void;
  onCreated: (dashboard: DashboardSummary) => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New dashboard</DialogTitle>
          <DialogDescription>
            Saved queries shown together, one under another. Add them once it's made.
          </DialogDescription>
        </DialogHeader>
        <DashboardForm
          initial={{ name: "", description: "", scope: "personal" }}
          canShare={user.role !== "viewer"}
          showScope
          label="New dashboard"
          submitLabel="Create"
          onSubmit={async (fields) => {
            const created = await createDashboard(fields);
            onCreated(created);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Changes a dashboard's title, description and, for its owner, who sees it, then hands the
 * changed dashboard to `onSaved` and closes.
 */
export function EditDashboardDialog({
  user,
  dashboard,
  onOpenChange,
  onSaved,
}: {
  user: Me;
  dashboard: DashboardSummary;
  onOpenChange: (open: boolean) => void;
  onSaved: (dashboard: Dashboard) => void;
}) {
  const title = `Edit ${dashboard.name}`;
  const isOwner = dashboard.owner?.id === user.id;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Its queries are changed on its page.</DialogDescription>
        </DialogHeader>
        <DashboardForm
          initial={{
            name: dashboard.name,
            description: dashboard.description ?? "",
            scope: dashboard.scope,
          }}
          canShare={user.role !== "viewer"}
          showScope={isOwner}
          label={title}
          submitLabel="Save"
          onSubmit={async ({ name, description, scope }) => {
            const saved = await updateDashboard(dashboard.id, {
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

/** Asks before deleting a dashboard, then hands its id to `onDeleted`. */
export function DeleteDashboardDialog({
  dashboard,
  onOpenChange,
  onDeleted,
}: {
  dashboard: DashboardSummary;
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
      await deleteDashboard(dashboard.id);
      onDeleted(dashboard.id);
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
          <AlertDialogTitle>Delete {dashboard.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {dashboard.scope === "global"
              ? "It's gone for everyone it's shared with. Its saved queries stay."
              : "Its saved queries stay."}
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

/**
 * Picks one of the saved queries the signed-in user sees and how to show it, and hands both to
 * `onAdd`, which adds it to the dashboard; it closes once that's done.
 */
export function AddQueryDialog({
  onOpenChange,
  onAdd,
}: {
  onOpenChange: (open: boolean) => void;
  onAdd: (query: SavedQuery, visualization: DashboardVisualization) => Promise<void>;
}) {
  const id = useId();
  const queries = useLoaded(fetchSavedQueries);
  const [queryId, setQueryId] = useState("");
  const [visualization, setVisualization] = useState<DashboardVisualization>("table");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = queries.kind === "loaded" ? queries.value : [];

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const query = list.find((q) => q.id === queryId);
    if (!query) {
      setError("Pick a query");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(query, visualization);
      onOpenChange(false);
    } catch (failure) {
      setError(describeError(failure));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a query</DialogTitle>
          <DialogDescription>
            It goes at the bottom of the dashboard, and runs each time it's opened.
          </DialogDescription>
        </DialogHeader>
        <form aria-label="Add a query" className="grid gap-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-query`}>Saved query</Label>
            <Select value={queryId} onValueChange={setQueryId}>
              <SelectTrigger id={`${id}-query`} className="w-full">
                <SelectValue
                  placeholder={queries.kind === "loading" ? "Loading…" : "Choose a query"}
                />
              </SelectTrigger>
              <SelectContent position="popper">
                {list.map((query) => (
                  <SelectItem key={query.id} value={query.id}>
                    {query.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {queries.kind === "loaded" && list.length === 0 && (
              <p className="animate-fade-in text-xs text-muted-foreground">
                No saved queries yet. Save one from the explorer first.
              </p>
            )}
            {queries.kind === "failed" && <FormError message={queries.message} />}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-visualization`}>Show as</Label>
            <Select
              value={visualization}
              onValueChange={(value) => {
                setVisualization(dashboardVisualization.parse(value));
              }}
            >
              <SelectTrigger id={`${id}-visualization`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {dashboardVisualizations.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {visualizationLabels[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormError message={error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !queryId}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
