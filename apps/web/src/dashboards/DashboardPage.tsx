import {
  type Dashboard,
  type DashboardItem,
  type DashboardItemInput,
  type DashboardRefreshMinutes,
  type QueryResult,
  type SavedQuery,
  type UpdateDashboardRequest,
} from "@pg_select1/shared";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";

import { IconButton } from "@/components/IconButton";
import { Loading } from "@/components/Loading";
import { ResultChart } from "@/components/ResultChart";
import { ResultNumber } from "@/components/ResultNumber";
import { RowsGrid } from "@/components/RowsGrid";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/connections/ConnectionForm";
import { runQuery } from "@/explore/api";
import { describeError } from "@/lib/api";
import { useLoaded } from "@/lib/loaded";
import { explorePathOf } from "@/queries/api";
import { ScopeBadge } from "@/queries/SavedQueryDialogs";
import { navigate } from "@/router";

import { fetchDashboard, updateDashboard } from "./api";
import { AddItemDialog, DeleteDashboardDialog, RemoveItemDialog } from "./DashboardDialogs";
import { InlineEdit } from "./InlineEdit";
import { RefreshDial } from "./RefreshDial";

// The one dialog open at a time.
type Open = "none" | "add" | "delete";

// What a query's last run answered. `n` counts the answers, so each fades in anew, and `key` is
// what was run, to tell whether it's what's asked for now.
interface Answer {
  key: string;
  n: number;
  outcome: { kind: "done"; result: QueryResult } | { kind: "failed"; message: string };
}

// A key for each item that stays as items are moved, added and removed, unlike their ids, which
// are new each time the dashboard is saved, so a moved query keeps its rows rather than running
// again. The same query a second time, on a dashboard from before a query could go on only once,
// is told apart by how many times it came before, and so are titles, which run nothing.
function itemKeys(items: readonly DashboardItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const of = item.kind === "query" ? item.savedQueryId : "title";
    const n = seen.get(of) ?? 0;
    seen.set(of, n + 1);
    return `${of}:${n}`;
  });
}

// Runs the queries again, by moving `refresh` on, `minutes` after they last ran, so running them
// again by hand starts the wait over. While the page is hidden, as in another tab, it waits until
// it's shown again, so a dashboard nobody's looking at doesn't keep its databases busy.
function useAutoRefresh(
  minutes: number | null | undefined,
  refresh: number,
  setRefresh: (refresh: number) => void,
): void {
  useEffect(() => {
    if (!minutes) return undefined;
    let due = false;
    const runAgain = () => {
      setRefresh(refresh + 1);
    };
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") runAgain();
      else due = true;
    }, minutes * 60_000);
    const onVisibilityChange = () => {
      if (due && document.visibilityState === "visible") runAgain();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [minutes, refresh, setRefresh]);
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
// last, which stays while it runs again, and whether it's running. A run's answer that comes in
// after it's been run again, or after the page is left, isn't shown; the query itself runs on to
// its end, or the API's statement timeout.
function useRun(
  connectionId: string | undefined,
  sql: string,
  refresh: number,
): { running: boolean; answer: Answer | undefined } {
  const key = connectionId ? JSON.stringify([connectionId, sql, refresh]) : undefined;
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  useEffect(() => {
    if (!key || !connectionId) return undefined;
    let wanted = true;
    const settle = (outcome: Answer["outcome"]) => {
      if (wanted) setAnswer((last) => ({ key, n: (last?.n ?? 0) + 1, outcome }));
    };
    runQuery(connectionId, sql).then(
      (result) => {
        settle({ kind: "done", result });
      },
      (error: unknown) => {
        settle({ kind: "failed", message: describeError(error) });
      },
    );
    return () => {
      wanted = false;
    };
  }, [key, connectionId, sql]);
  return { running: key !== undefined && answer?.key !== key, answer };
}

// Moving a query or title up or down, or taking either off: what `canEdit` shows beside its
// name. A title's changed where it stands, with `onRename`.
interface ItemControls {
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (by: -1 | 1) => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}

// The buttons beside an item, shown while it's hovered or has focus within it, or always where
// there's no mouse to hover with, as on a phone. Taking it off asks first.
function ItemButtons({
  name,
  isTitle = false,
  controls,
}: {
  name: string;
  isTitle?: boolean;
  controls: ItemControls;
}) {
  const { first, last, busy, onMove, onRemove } = controls;
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex shrink-0 gap-1 pointer-fine:opacity-0 pointer-fine:group-focus-within/item:opacity-100 pointer-fine:group-hover/item:animate-fade-in pointer-fine:group-hover/item:opacity-100">
      <Button
        variant="ghost"
        size="icon"
        className="cursor-pointer"
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
        className="cursor-pointer"
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
        className="cursor-pointer"
        aria-label={`Remove ${name}`}
        title="Remove from the dashboard"
        disabled={busy}
        onClick={() => {
          setConfirming(true);
        }}
      >
        <XIcon />
      </Button>
      {confirming && (
        <RemoveItemDialog
          name={name}
          isTitle={isTitle}
          onOpenChange={setConfirming}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

// A query's result as the query says it's shown: its rows in a grid, a chart of them, or the
// one number in its first row's first column.
function ResultOf({ query, result }: { query: SavedQuery; result: QueryResult }) {
  const { display } = query;
  if (display.type === "chart") return <ResultChart data={result} kind={display.kind} />;
  if (display.type === "number") return <ResultNumber data={result} />;
  return <RowsGrid data={result} label={`${query.name}'s rows`} sql={query.sql} />;
}

// One saved query on the dashboard: its name, which opens it in the explorer, its database and
// description, then its result, run on its first database and shown as the query says. A number
// takes a third of the dashboard's width, so up to three in a row sit side by side; anything
// else takes the whole of it. A number has its database under its name, where there's room,
// and doesn't say how many rows it had or how long they took, being one value.
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
  const isNumber = query.display.type === "number";

  return (
    <section
      aria-label={query.name}
      className={`group/item grid min-w-0 content-start gap-3 ${isNumber ? "sm:col-span-1" : "sm:col-span-3"}`}
    >
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
            {connection && !isNumber && (
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
          {connection && isNumber && (
            <p className="truncate font-mono text-xs text-muted-foreground">{connection.name}</p>
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
          {(!isNumber || shown.result.columns.length === 0) && (
            <p className="text-xs text-muted-foreground">{describeResult(shown.result)}</p>
          )}
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
      className="group/item flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:col-span-3"
    >
      Someone's personal query, which only they see.
      {controls && <ItemButtons name="this query" controls={controls} />}
    </section>
  );
}

// A title over the queries after it, the whole width of the dashboard, changed where it stands
// by those who can change the dashboard.
function TitleItem({ title, controls }: { title: string; controls?: ItemControls }) {
  return (
    <section
      aria-label={title}
      className="group/item flex min-w-0 items-end justify-between gap-4 border-b pt-2 pb-2 sm:col-span-3"
    >
      <h2 className="min-w-0 text-base font-semibold break-words">
        {controls ? (
          <InlineEdit
            value={title}
            label="Title"
            required
            maxLength={200}
            onSave={controls.onRename}
          />
        ) : (
          title
        )}
      </h2>
      {controls && <ItemButtons name={title} isTitle controls={controls} />}
    </section>
  );
}

// What the API takes for a dashboard's queries and titles.
function itemsInput(items: readonly DashboardItem[]): DashboardItemInput[] {
  return items.map((item) =>
    item.kind === "query" ? { savedQueryId: item.savedQueryId } : { title: item.title },
  );
}

// How many queries are among `items`, titles aside.
function queryCount(items: readonly DashboardItem[]): number {
  return items.filter((item) => item.kind === "query").length;
}

/**
 * A dashboard: its title and description, then each of its saved queries and titles, one under
 * another, the whole width of the page but for numbers, which take a third of it so that two or
 * three in a row sit side by side. Each query runs on its database when the page opens, read-only
 * as in the explorer, and is shown as it was saved to be: as a table of its rows, a chart or a
 * number. They run again when asked, and by themselves as often as the dashboard says, while the
 * page is shown; running them again keeps their results on screen until the new ones fade in.
 * Those who can change the dashboard add queries, each once, and titles to it, move them up and
 * down, take them off once they've said they mean it, change how often it refreshes, change its
 * title and description where they stand, and delete it; who sees it is changed from the list of
 * dashboards. The header's buttons are icons
 * alone, each named in a tooltip. Anyone else can still pick how often it refreshes for
 * themselves, while they're on the page.
 */
export function DashboardPage({ id }: { id: string }) {
  const load = useMemo(() => () => fetchDashboard(id), [id]);
  const loaded = useLoaded(load);
  // The dashboard as changed here since it loaded.
  const [changed, setChanged] = useState<Dashboard | undefined>(undefined);
  const [open, setOpen] = useState<Open>("none");
  const [refresh, setRefresh] = useState(0);
  // How often someone who can't change the dashboard has picked to refresh it, for as long as
  // they're on the page.
  const [ownRefresh, setOwnRefresh] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dashboard = changed ?? (loaded.kind === "loaded" ? loaded.value : undefined);
  const refreshMinutes = ownRefresh === undefined ? dashboard?.refreshMinutes : ownRefresh;
  useAutoRefresh(refreshMinutes, refresh, setRefresh);
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

  // Shows the dashboard as `next` at once, and puts it back if saving `changes` fails.
  const save = async (next: Dashboard, changes: UpdateDashboardRequest) => {
    const before = dashboard;
    setChanged(next);
    setSaving(true);
    setError(null);
    try {
      setChanged(await updateDashboard(dashboard.id, changes));
    } catch (failure) {
      setChanged(before);
      setError(`Couldn't save the dashboard: ${describeError(failure)}`);
    } finally {
      setSaving(false);
    }
  };

  const saveItems = (items: DashboardItem[]) =>
    save({ ...dashboard, items, itemCount: queryCount(items) }, { items: itemsInput(items) });

  const pickRefresh = (minutes: DashboardRefreshMinutes | null) => {
    if (dashboard.canEdit)
      void save({ ...dashboard, refreshMinutes: minutes }, { refreshMinutes: minutes });
    else setOwnRefresh(minutes);
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
      onRename: (title) => {
        void saveItems(
          items.map((item, i) =>
            i === index && item.kind === "title" ? { ...item, title } : item,
          ),
        );
      },
      onRemove: () => {
        void saveItems(items.filter((_, i) => i !== index));
      },
    };
  };

  // Saves the dashboard with `items` in place of its own, for a dialog to say why if it fails.
  const saveFromDialog = async (items: DashboardItemInput[]) => {
    setChanged(await updateDashboard(dashboard.id, { items }));
  };

  const keys = itemKeys(dashboard.items);
  const hasQueries = dashboard.items.some((item) => item.kind === "query");
  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid min-w-0 flex-1 gap-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              {dashboard.canEdit ? (
                <InlineEdit
                  value={dashboard.name}
                  label="Title"
                  required
                  maxLength={200}
                  onSave={(name) => void save({ ...dashboard, name }, { name })}
                />
              ) : (
                dashboard.name
              )}
              <ScopeBadge scope={dashboard.scope} />
            </h1>
            {dashboard.canEdit ? (
              <div className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">
                <InlineEdit
                  value={dashboard.description ?? ""}
                  label="Description"
                  placeholder="Add a description"
                  maxLength={2000}
                  onSave={(description) =>
                    void save({ ...dashboard, description: description || null }, { description })
                  }
                />
              </div>
            ) : (
              dashboard.description && (
                <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">
                  {dashboard.description}
                </p>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasQueries && (
              <>
                <RefreshDial minutes={refreshMinutes ?? null} onChange={pickRefresh} />
                <IconButton
                  label="Run again"
                  icon={<RotateCwIcon />}
                  onClick={() => {
                    setRefresh((n) => n + 1);
                  }}
                />
              </>
            )}
            {dashboard.canEdit && (
              <>
                <IconButton
                  label="Add a query or title"
                  icon={<PlusIcon />}
                  disabled={saving}
                  onClick={() => {
                    setOpen("add");
                  }}
                />
                <IconButton
                  label="Delete the dashboard"
                  icon={<Trash2Icon />}
                  destructive
                  onClick={() => {
                    setOpen("delete");
                  }}
                />
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
      {dashboard.items.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-3">
          {dashboard.items.map((item, index) => {
            const key = keys[index];
            const controls = controlsOf(index);
            if (item.kind === "title") {
              return <TitleItem key={key} title={item.title} controls={controls} />;
            }
            return item.savedQuery ? (
              <QueryItem key={key} query={item.savedQuery} refresh={refresh} controls={controls} />
            ) : (
              <HiddenItem key={key} controls={controls} />
            );
          })}
        </div>
      )}

      {open === "add" && (
        <AddItemDialog
          added={
            new Set(
              dashboard.items.flatMap((item) => (item.kind === "query" ? [item.savedQueryId] : [])),
            )
          }
          onOpenChange={closeDialog}
          onAddQuery={(query) =>
            saveFromDialog([...itemsInput(dashboard.items), { savedQueryId: query.id }])
          }
          onAddTitle={(title) => saveFromDialog([...itemsInput(dashboard.items), { title }])}
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
