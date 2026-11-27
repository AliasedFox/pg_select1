import type { DashboardSummary, Me } from "@pg_select1/shared";
import { MoreHorizontalIcon } from "lucide-react";
import { type MouseEvent, useState } from "react";

import { Loading } from "@/components/Loading";
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
import { type Loaded, useLoaded } from "@/lib/loaded";
import { ScopeBadge } from "@/queries/SavedQueryDialogs";
import { navigate } from "@/router";

import { dashboardPath, fetchDashboards } from "./api";
import { DeleteDashboardDialog, EditDashboardDialog, NewDashboardDialog } from "./DashboardDialogs";

// The one dialog open at a time.
type Open =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "edit"; dashboard: DashboardSummary }
  | { kind: "delete"; dashboard: DashboardSummary };

function ownerOf(dashboard: DashboardSummary, user: Me): string {
  if (!dashboard.owner) return "A deleted user";
  return dashboard.owner.id === user.id ? "You" : dashboard.owner.name;
}

/**
 * Lists the dashboards the signed-in user sees, by title: everyone's global ones and their own
 * personal ones. A new one is made here and opens on its own page, where its queries are added;
 * its title, description and who sees it are changed here too, and it can be deleted, by those
 * who can change it.
 */
export function DashboardsPage({ user }: { user: Me }) {
  const loaded = useLoaded(fetchDashboards);
  // What was changed or deleted here since it loaded, over what loaded.
  const [changed, setChanged] = useState<Map<string, DashboardSummary | null>>(new Map());
  const [open, setOpen] = useState<Open>({ kind: "none" });

  const dashboards = withChanges(loaded, changed);
  const change = (id: string, dashboard: DashboardSummary | null) => {
    setChanged((current) => new Map(current).set(id, dashboard));
  };
  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) setOpen({ kind: "none" });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Dashboards</h1>
          <p className="text-sm text-muted-foreground">
            Saved queries shown together, run each time a dashboard is opened. A personal one is
            yours alone; a global one everyone signed in sees.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setOpen({ kind: "new" });
          }}
        >
          New dashboard
        </Button>
      </div>

      {loaded.kind === "loading" && <Loading />}
      {loaded.kind === "failed" && (
        <p role="alert" className="animate-fade-in text-sm text-destructive">
          Couldn't load dashboards: {loaded.message}
        </p>
      )}
      {dashboards?.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No dashboards yet. Make one to see the rows of several saved queries on one page.
        </div>
      )}
      {dashboards !== undefined && dashboards.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Queries</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Made by</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboards.map((dashboard) => (
                <TableRow key={dashboard.id}>
                  <TableCell className="max-w-md whitespace-normal">
                    <a
                      href={dashboardPath(dashboard.id)}
                      className="font-medium underline-offset-4 hover:underline"
                      onClick={(event: MouseEvent) => {
                        event.preventDefault();
                        navigate(dashboardPath(dashboard.id));
                      }}
                    >
                      {dashboard.name}
                    </a>
                    {dashboard.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {dashboard.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {dashboard.itemCount}
                  </TableCell>
                  <TableCell>
                    <ScopeBadge scope={dashboard.scope} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ownerOf(dashboard, user)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <time dateTime={dashboard.updatedAt}>
                      {new Date(dashboard.updatedAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    </time>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${dashboard.name}`}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            navigate(dashboardPath(dashboard.id));
                          }}
                        >
                          Open
                        </DropdownMenuItem>
                        {dashboard.canEdit && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => {
                                setOpen({ kind: "edit", dashboard });
                              }}
                            >
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => {
                                setOpen({ kind: "delete", dashboard });
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

      {open.kind === "new" && (
        <NewDashboardDialog
          user={user}
          onOpenChange={closeDialog}
          onCreated={(created) => {
            navigate(dashboardPath(created.id));
          }}
        />
      )}
      {open.kind === "edit" && (
        <EditDashboardDialog
          user={user}
          dashboard={open.dashboard}
          onOpenChange={closeDialog}
          onSaved={(saved) => {
            change(saved.id, saved);
          }}
        />
      )}
      {open.kind === "delete" && (
        <DeleteDashboardDialog
          dashboard={open.dashboard}
          onOpenChange={closeDialog}
          onDeleted={(id) => {
            change(id, null);
          }}
        />
      )}
    </div>
  );
}

// The dashboards as loaded, with the changes made since, still by title.
function withChanges(
  loaded: Loaded<DashboardSummary[]>,
  changed: Map<string, DashboardSummary | null>,
): DashboardSummary[] | undefined {
  if (loaded.kind !== "loaded") return undefined;
  return loaded.value
    .map((dashboard) => (changed.has(dashboard.id) ? changed.get(dashboard.id) : dashboard))
    .filter(
      (dashboard): dashboard is DashboardSummary => dashboard !== null && dashboard !== undefined,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
