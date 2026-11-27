import type { Dashboard, DashboardItem, Me, QueryResult, SavedQuery } from "@pg_select1/shared";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";

import { Loading } from "@/components/Loading";
import { ResultChart } from "@/components/ResultChart";
import { ResultNumber } from "@/components/ResultNumber";
import { RowsGrid } from "@/components/RowsGrid";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/connections/ConnectionForm";
import { cancelQuery, newRunId, runQuery } from "@/explore/api";
import { describeError } from "@/lib/api";
import { useLoaded } from "@/lib/loaded";
import { explorePathOf } from "@/queries/api";
import { ScopeBadge } from "@/queries/SavedQueryDialogs";
import { navigate } from "@/router";

import { fetchDashboard, updateDashboard } from "./api";
import { AddQueryDialog, DeleteDashboardDialog, EditDashboardDialog } from "./DashboardDialogs";

// The one dialog open at a time.
type Open = "none" | "add" | "edit" | "delete";

// What a query's last run answered. `n` counts the answers, so each fades in anew, and `key` is
// what was run, to tell whether it's what's asked for now.
interface Answer {
  key: string;
  n: number;
  outcome: { kind: "done"; result: QueryResult } | { kind: "failed"; message: string };
}

// A key for each item that stays as items are moved, added and removed, unlike their ids, which
// are new each time the dashboard is saved, so a moved query keeps its rows rather than running
// again. The same query a second time is told apart by how many times it came before.
function itemKeys(items: readonly DashboardItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const n = seen.get(item.savedQueryId) ?? 0;
    seen.set(item.savedQueryId, n + 1);
    return `${item.savedQueryId}:${n}`;
  });
}

// How many rows a result has, and how long the database took for them.
function describeResult({ columns, rows, truncated, durationMs }: QueryResult): string {
  const took = `in ${durationMs.toLocaleString()} ms`;
  if (columns.length === 0) return `The statement ran ${took} and returns no rows.`;
  if (truncated) {
    return `The first ${rows.length.toLocaleString()} rows ${took}; open it in the explorer for the rest.`;
  }
  return `${rows.length === 1 ? "1 row" : `${rows.length.toLocaleString()} rows`} ${took}`;
}

// Runs `sql` on a connection, and again whenever `refresh` changes, answering what it answered
// last, which stays while it runs again, and whether it's running. A run still going when it's
// run again or the page is left is cancelled.
function useRun(
  connectionId: string | undefined,
  sql: string,
  refresh: number,
): { running: boolean; answer: Answer | undefined } {
  const key = connectionId ? JSON.stringify([connectionId, sql, refresh]) : undefined;
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  useEffect(() => {
    if (!key || !connectionId) return undefined;
    const runId = newRunId();
    let wanted = true;
    let settled = false;
    const settle = (outcome: Answer["outcome"]) => {
      settled = true;
      if (wanted) setAnswer((last) => ({ key, n: (last?.n ?? 0) + 1, outcome }));
    };
    runQuery(connectionId, sql, runId).then(
      (result) => {
        settle({ kind: "done", result });
      },
      (error: unknown) => {
        settle({ kind: "failed", message: describeError(error) });
      },
    );
    return () => {
      wanted = false;
      // Nothing to tell anyone if it fails: the query still ends at the API's statement timeout.
      if (!settled) cancelQuery(runId).catch(() => undefined);
    };
  }, [key, connectionId, sql]);
  return { running: key !== undefined && answer?.key !== key, answer };
}

// Moving a query up or down, or taking it off: what `canEdit` shows beside its name.
interface ItemControls {
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

function ItemButtons({ name, controls }: { name: string; controls: ItemControls }) {
  const { first, last, busy, onMove, onRemove } = controls;
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Move ${name} up`}
        title="Move up"
        disabled={busy || first}
        onClick={() => {
          onMove(-1);
        }}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Move ${name} down`}
        title="Move down"
        disabled={busy || last}
        onClick={() => {
          onMove(1);
        }}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        title="Remove from the dashboard"
        disabled={busy}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </div>
  );
}

// A query's result as the query says it's shown: its rows in a grid, a chart of them, or the
// one number in its first row's first column.
function ResultOf({ query, result }: { query: SavedQuery; result: QueryResult }) {
  const { display } = query;
  if (display.type === "chart") return <ResultChart data={result} settings={display} />;
  if (display.type === "number") return <ResultNumber data={result} />;
  return <RowsGrid data={result} label={`${query.name}'s rows`} sql={query.sql} />;
}

// One saved query on the dashboard, the whole width of it: its name, which opens it in the
// explorer, its database and description, then its result, run on its first database and shown
// as the query says.
function QueryItem({
  query,
  refresh,
  controls,
}: {
  query: SavedQuery;
  refresh: number;
  controls?: ItemControls;
}) {
  const connection = query.connections[0];
  const { running, answer } = useRun(connection?.id, query.sql, refresh);
  const shown = answer?.outcome;

  return (
    <section aria-label={query.name} className="grid min-w-0 gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <a
              href={explorePathOf(query)}
              className="underline-offset-4 hover:underline"
              onClick={(event: MouseEvent) => {
                event.preventDefault();
                navigate(explorePathOf(query));
              }}
            >
              {query.name}
            </a>
            {connection && (
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {connection.name}
              </span>
            )}
            {running && (
              <Spinner
                aria-label="Running"
                className="size-3.5 animate-fade-in text-muted-foreground"
              />
            )}
          </h2>
          {query.description && (
            <p className="text-sm text-muted-foreground">{query.description}</p>
          )}
        </div>
        {controls && <ItemButtons name={query.name} controls={controls} />}
      </div>
      {!connection && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Its database was deleted, or isn't one you can explore. Open it in the explorer to run it
          on another.
        </p>
      )}
      {connection && !shown && <div className="h-24 rounded-lg border" />}
      {shown?.kind === "failed" && (
        <p key={answer?.n} role="alert" className="animate-fade-in text-sm text-destructive">
          {shown.message}
        </p>
      )}
      {shown?.kind === "done" && (
        <div key={answer?.n} className="grid min-w-0 animate-fade-in gap-2">
          <p className="text-xs text-muted-foreground">{describeResult(shown.result)}</p>
          {shown.result.columns.length > 0 && <ResultOf query={query} result={shown.result} />}
        </div>
      )}
    </section>
  );
}

// A query on the dashboard that the signed-in user doesn't see: someone else's personal one.
function HiddenItem({ controls }: { controls?: ItemControls }) {
  return (
    <section
      aria-label="A query you can't see"
      className="flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
    >
      Someone's personal query, which only they see.
      {controls && <ItemButtons name="this query" controls={controls} />}
    </section>
  );
}

// What the API takes for a dashboard's queries.
function itemsInput(items: readonly DashboardItem[]) {
  return items.map(({ savedQueryId }) => ({ savedQueryId }));
}

/**
 * A dashboard: its title and description, then each of its saved queries, one under another, the
 * whole width of the page, each run on its database when the page opens, read-only as in the
 * explorer, and shown as the query was saved to be: as a table of its rows, a chart or a number.
 * Running them again keeps their results on screen until the new ones fade in, and leaving the
 * page cancels what's still running. Those who can change the dashboard add queries to it, move
 * them up and down, take them off, and change its title, description and who sees it, or delete
 * it.
 */
export function DashboardPage({ id, user }: { id: string; user: Me }) {
  const load = useMemo(() => () => fetchDashboard(id), [id]);
  const loaded = useLoaded(load);
  // The dashboard as changed here since it loaded.
  const [changed, setChanged] = useState<Dashboard | undefined>(undefined);
  const [open, setOpen] = useState<Open>("none");
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dashboard = changed ?? (loaded.kind === "loaded" ? loaded.value : undefined);
  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) setOpen("none");
  };

  const back = (
    <a
      href="/dashboards"
      className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        navigate("/dashboards");
      }}
    >
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      Dashboards
    </a>
  );

  if (!dashboard) {
    return (
      <div className="grid gap-4">
        {back}
        {loaded.kind === "failed" ? (
          <p role="alert" className="animate-fade-in text-sm text-destructive">
            Couldn't load the dashboard: {loaded.message}
          </p>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  // Shows the queries in their new order at once, and puts them back if saving it fails.
  const saveItems = async (items: DashboardItem[]) => {
    const before = dashboard;
    setChanged({ ...dashboard, items, itemCount: items.length });
    setSaving(true);
    setError(null);
    try {
      setChanged(await updateDashboard(dashboard.id, { items: itemsInput(items) }));
    } catch (failure) {
      setChanged(before);
      setError(`Couldn't save the dashboard: ${describeError(failure)}`);
    } finally {
      setSaving(false);
    }
  };

  const controlsOf = (index: number): ItemControls | undefined => {
    if (!dashboard.canEdit) return undefined;
    const { items } = dashboard;
    return {
      first: index === 0,
      last: index === items.length - 1,
      busy: saving,
      onMove: (by) => {
        const next = [...items];
        const [moved] = next.splice(index, 1);
        if (!moved) return;
        next.splice(index + by, 0, moved);
        void saveItems(next);
      },
      onRemove: () => {
        void saveItems(items.filter((_, i) => i !== index));
      },
    };
  };

  const keys = itemKeys(dashboard.items);
  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              {dashboard.name}
              <ScopeBadge scope={dashboard.scope} />
            </h1>
            {dashboard.description && (
              <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">
                {dashboard.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {dashboard.items.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setRefresh((n) => n + 1);
                }}
              >
                <RotateCwIcon />
                Run again
              </Button>
            )}
            {dashboard.canEdit && (
              <>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setOpen("add");
                  }}
                >
                  <PlusIcon />
                  Add query
                </Button>
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
                        setOpen("edit");
                      }}
                    >
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setOpen("delete");
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
        <FormError message={error} />
      </div>

      {dashboard.items.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {dashboard.canEdit
            ? "No queries on this dashboard yet. Add a saved query to see its rows here."
            : "No queries on this dashboard yet."}
        </div>
      )}
      {dashboard.items.map((item, index) => {
        const key = keys[index];
        const controls = controlsOf(index);
        return item.savedQuery ? (
          <QueryItem key={key} query={item.savedQuery} refresh={refresh} controls={controls} />
        ) : (
          <HiddenItem key={key} controls={controls} />
        );
      })}

      {open === "add" && (
        <AddQueryDialog
          onOpenChange={closeDialog}
          onAdd={async (query) => {
            const saved = await updateDashboard(dashboard.id, {
              items: [...itemsInput(dashboard.items), { savedQueryId: query.id }],
            });
            setChanged(saved);
          }}
        />
      )}
      {open === "edit" && (
        <EditDashboardDialog
          user={user}
          dashboard={dashboard}
          onOpenChange={closeDialog}
          onSaved={setChanged}
        />
      )}
      {open === "delete" && (
        <DeleteDashboardDialog
          dashboard={dashboard}
          onOpenChange={closeDialog}
          onDeleted={() => {
            navigate("/dashboards");
          }}
        />
      )}
    </div>
  );
}
