import type { Me, SavedQuery } from "@pg_select1/shared";
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
import { displayName } from "@/lib/display";
import { type Loaded, useLoaded } from "@/lib/loaded";
import { navigate } from "@/router";

import { explorePathOf, fetchSavedQueries } from "./api";
import { DeleteSavedQueryDialog, EditSavedQueryDialog, ScopeBadge } from "./SavedQueryDialogs";

// The one dialog open at a time.
type Open =
  | { kind: "none" }
  | { kind: "edit"; query: SavedQuery }
  | { kind: "delete"; query: SavedQuery };

// How a query's result is shown, as the explorer opens it and dashboards show it, with its icon.
function ShownAs({ query }: { query: SavedQuery }) {
  const { label, icon: Icon } = displayName(query.display);
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground [&_svg]:size-4">
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

function ownerOf(query: SavedQuery, user: Me): string {
  if (!query.owner) return "A deleted user";
  return query.owner.id === user.id ? "You" : query.owner.name;
}

/**
 * Lists the saved queries the signed-in user sees, by name: everyone's global ones and their own
 * personal ones, each with how its result is shown. Opening one takes it to the explorer, where its SQL and database are changed;
 * its name, description and who sees it are changed here, and it can be deleted, by those who
 * can change it. New queries are saved from the explorer.
 */
export function SavedQueriesPage({ user }: { user: Me }) {
  const loaded = useLoaded(fetchSavedQueries);
  // What was changed or deleted here since it loaded, over what loaded.
  const [changed, setChanged] = useState<Map<string, SavedQuery | null>>(new Map());
  const [open, setOpen] = useState<Open>({ kind: "none" });

  const queries = withChanges(loaded, changed);
  const change = (id: string, query: SavedQuery | null) => {
    setChanged((current) => new Map(current).set(id, query));
  };
  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) setOpen({ kind: "none" });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Saved queries</h1>
          <p className="text-sm text-muted-foreground">
            Queries saved to run again. A personal one is yours alone; a global one everyone signed
            in sees.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            navigate("/explore");
          }}
        >
          New query
        </Button>
      </div>

      {loaded.kind === "loading" && <Loading />}
      {loaded.kind === "failed" && (
        <p role="alert" className="animate-fade-in text-sm text-destructive">
          Couldn't load saved queries: {loaded.message}
        </p>
      )}
      {queries?.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No saved queries yet. Write one in the explorer and save it to find it here.
        </div>
      )}
      {queries !== undefined && queries.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Database</TableHead>
                <TableHead>Shown as</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Saved by</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queries.map((query) => (
                <TableRow key={query.id}>
                  <TableCell className="max-w-md whitespace-normal">
                    <a
                      href={explorePathOf(query)}
                      className="font-medium underline-offset-4 hover:underline"
                      onClick={(event: MouseEvent) => {
                        event.preventDefault();
                        navigate(explorePathOf(query));
                      }}
                    >
                      {query.name}
                    </a>
                    {query.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {query.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {query.connections.length > 0
                      ? query.connections.map((c) => c.name).join(", ")
                      : "none"}
                  </TableCell>
                  <TableCell>
                    <ShownAs query={query} />
                  </TableCell>
                  <TableCell>
                    <ScopeBadge scope={query.scope} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ownerOf(query, user)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <time dateTime={query.updatedAt}>
                      {new Date(query.updatedAt).toLocaleDateString(undefined, {
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
                          aria-label={`Actions for ${query.name}`}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            navigate(explorePathOf(query));
                          }}
                        >
                          Open in explorer
                        </DropdownMenuItem>
                        {query.canEdit && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => {
                                setOpen({ kind: "edit", query });
                              }}
                            >
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => {
                                setOpen({ kind: "delete", query });
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

      {open.kind === "edit" && (
        <EditSavedQueryDialog
          user={user}
          query={open.query}
          onOpenChange={closeDialog}
          onSaved={(saved) => {
            change(saved.id, saved);
          }}
        />
      )}
      {open.kind === "delete" && (
        <DeleteSavedQueryDialog
          query={open.query}
          onOpenChange={closeDialog}
          onDeleted={(id) => {
            change(id, null);
          }}
        />
      )}
    </div>
  );
}

// The queries as loaded, with the changes made since, still by name.
function withChanges(
  loaded: Loaded<SavedQuery[]>,
  changed: Map<string, SavedQuery | null>,
): SavedQuery[] | undefined {
  if (loaded.kind !== "loaded") return undefined;
  return loaded.value
    .map((query) => (changed.has(query.id) ? changed.get(query.id) : query))
    .filter((query): query is SavedQuery => query !== null && query !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}
