import { MAX_QUERY_ROWS, type Me, type QueryResult, type SavedQuery } from "@pg_select1/shared";
import { PlayIcon, SaveIcon, SquareIcon, EraserIcon } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { Loading } from "@/components/Loading";
import { RowsGrid } from "@/components/RowsGrid";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SqlEditor, type SqlEditorHandle } from "@/editor/SqlEditor";
import { describeError } from "@/lib/api";
import { useLoaded } from "@/lib/loaded";
import { modifierKey } from "@/lib/platform";
import { sqlTableName } from "@/lib/sql";
import { cn } from "@/lib/utils";
import { fetchSavedQuery, updateSavedQuery } from "@/queries/api";
import { SaveQueryDialog, ScopeBadge } from "@/queries/SavedQueryDialogs";
import { navigate, useSearchParams } from "@/router";

import { cancelQuery, fetchExplorableConnections, fetchTables, runQuery } from "./api";
import { DatabaseSelect, NoDatabases } from "./DatabaseSelect";
import { TableList } from "./TableList";

type Answer = { kind: "done"; result: QueryResult } | { kind: "failed"; message: string };

// What the last run to end answered, kept on screen while the next one runs, rather than
// swapped for a spinner and back. `n` counts runs, so each answer fades in anew. `sql` is what
// was run, which the pages after the first run again, whatever the editor holds by then.
interface Outcome {
  answer: Answer;
  connectionId: string;
  sql: string;
  n: number;
}

// Below the rows: nothing, the next page loading, or why it didn't.
type Paging = { kind: "idle" } | { kind: "loading" } | { kind: "failed"; message: string };

// Beside the Run button: nothing running, a run that's been going a while, or one cancelled.
type Status = "idle" | "running" | "cancelled";

// Beside the Save button: nothing, saving the open query's changes, saved, or why not. `n`
// counts saves, so each "Saved" fades in anew.
type Saving =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; n: number }
  | { kind: "failed"; message: string };

// How long a run goes before it says it's running and offers to cancel, so a quick one doesn't
// flash a Cancel button and a spinner.
const SLOW_MS = 300;

// A random UUID to cancel a run by. `crypto.randomUUID` needs a secure context, and pg_select1
// may be served over plain HTTP on a local network.
function newRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Cancels the run that's still wanted, if any, and forgets it.
function cancelCurrent(current: RefObject<string | undefined>): void {
  const id = current.current;
  current.current = undefined;
  // Nothing to tell anyone if it fails: the query still ends at the API's statement timeout.
  if (id) cancelQuery(id).catch(() => undefined);
}

// The explorer's address on a database, with a saved query open or not.
function explorePath(connection: string | undefined, queryId: string | null): string {
  const params = new URLSearchParams(connection ? { connection } : {});
  if (queryId) params.set("query", queryId);
  const search = params.toString();
  return search ? `/explore?${search}` : "/explore";
}

// How many rows a result has so far, and how long the database took for the first page.
function describeResult({ columns, rows, truncated, durationMs }: QueryResult): string {
  const took = `in ${durationMs.toLocaleString()} ms`;
  const first = `The first ${rows.length.toLocaleString()} rows ${took}`;
  if (truncated && rows.length >= MAX_QUERY_ROWS) {
    return `${first}; there are more, which the explorer doesn't read. Narrow the query to see them.`;
  }
  if (truncated) return `${first}; scroll for more.`;
  if (columns.length === 0) return `The statement ran ${took} and returns no rows.`;
  return `${rows.length === 1 ? "1 row" : `${rows.length.toLocaleString()} rows`} ${took}`;
}

/**
 * The explorer: pick one of the databases the signed-in user can explore (the first, until
 * another is picked), write a SQL statement
 * in the {@link SqlEditor} and run it there, read-only, to see its rows, a page at a time as the
 * person scrolls down, up to {@link MAX_QUERY_ROWS}.
 * The database's tables are listed beside it. Clicking one replaces the SQL with `select * from`
 * it and runs that, and each has a button to copy its name. While a query runs, the last result
 * stays on screen until the new one fades in over it. A run can be cancelled, and is when the
 * person picks another database or leaves the page. The database is kept in the address, so a
 * reload or a link opens the same one.
 *
 * The SQL can be saved as a query, on the database picked, and a saved query opened from the
 * address (`?query=<id>`), with its SQL in the editor and its database picked, and run at once
 * on it. Changes to a saved query `user` can change are saved over it; any other is saved as a
 * new one.
 */
export function ExplorePage({ user }: { user: Me }) {
  const isAdmin = user.role === "admin";
  const params = useSearchParams();
  const connections = useLoaded(fetchExplorableConnections);
  const queryId = params.get("query");
  const [opened, setOpened] = useState<SavedQuery | undefined>(undefined);
  const [openError, setOpenError] = useState<{ id: string; message: string } | null>(null);
  // The saved query in the address, once it's loaded.
  const savedQuery = opened?.id === queryId ? opened : undefined;
  // The database in the address, else the open saved query's.
  const chosenName = params.get("connection") ?? savedQuery?.connections[0]?.name ?? null;
  const [sql, setSql] = useState("");
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const [status, setStatus] = useState<Status>("idle");
  const [paging, setPaging] = useState<Paging>({ kind: "idle" });
  const runs = useRef(0);
  // The run whose answer is still wanted, so a cancelled or replaced one's is dropped.
  const current = useRef<string | undefined>(undefined);
  // The same for the next page's run.
  const page = useRef<string | undefined>(undefined);
  const editor = useRef<SqlEditorHandle>(null);
  // The saved query asked for last, so it's loaded once, not again after it's saved.
  const asked = useRef<string | undefined>(undefined);
  const [saving, setSaving] = useState<Saving>({ kind: "idle" });
  const [saveDialog, setSaveDialog] = useState(false);
  const saves = useRef(0);
  // The saved query just opened, to run once its database is picked.
  const runOnOpen = useRef<string | undefined>(undefined);

  const list = connections.kind === "loaded" ? connections.value : [];
  // With none in the address, the first database is picked, once a saved query being opened has
  // said whether it has one of its own, so its tables aren't loaded for nothing.
  const opening = queryId !== null && !savedQuery && openError?.id !== queryId;
  const connection =
    list.find((c) => c.name === chosenName) ??
    (chosenName === null && !opening ? list[0] : undefined);
  const connectionId = connection?.id;

  const loadTables = useMemo(
    () => (connectionId ? () => fetchTables(connectionId) : null),
    [connectionId],
  );
  const tables = useLoaded(loadTables);

  // Opens the saved query in the address: its SQL goes in the editor.
  useEffect(() => {
    if (!queryId || asked.current === queryId) return undefined;
    asked.current = queryId;
    let done = false;
    fetchSavedQuery(queryId).then(
      (query) => {
        done = true;
        if (asked.current !== query.id) return;
        setOpened(query);
        setSql(query.sql);
        runOnOpen.current = query.id;
      },
      (error: unknown) => {
        done = true;
        if (asked.current === queryId) setOpenError({ id: queryId, message: describeError(error) });
      },
    );
    return () => {
      // Asked again if the page's still there, as when React runs effects twice in development.
      if (!done) asked.current = undefined;
    };
  }, [queryId]);

  const stop = () => {
    cancelCurrent(current);
    cancelCurrent(page);
    setPaging({ kind: "idle" });
  };
  // Leaving the page cancels what's running.
  useEffect(
    () => () => {
      cancelCurrent(current);
      cancelCurrent(page);
    },
    [],
  );

  // Runs `text`, the SQL as written unless given.
  const start = (text = sql) => {
    if (!connectionId || !text.trim() || current.current) return;
    // The next page of the last result won't be wanted once this one's in.
    cancelCurrent(page);
    setPaging({ kind: "idle" });
    const id = newRunId();
    current.current = id;
    setStatus("idle");
    const slow = setTimeout(() => {
      if (current.current === id) setStatus("running");
    }, SLOW_MS);
    const settle = (answer: Answer) => {
      clearTimeout(slow);
      if (current.current !== id) return;
      current.current = undefined;
      runs.current += 1;
      setOutcome({ answer, connectionId, sql: text, n: runs.current });
      setStatus("idle");
    };
    runQuery(connectionId, text, id).then(
      (result) => {
        settle({ kind: "done", result });
      },
      (error: unknown) => {
        settle({ kind: "failed", message: describeError(error) });
      },
    );
  };

  // Saves the SQL and database over the open saved query.
  const saveChanges = () => {
    if (!savedQuery || !connectionId) return;
    setSaving({ kind: "saving" });
    updateSavedQuery(savedQuery.id, { sql, connectionIds: [connectionId] }).then(
      (saved) => {
        setOpened(saved);
        saves.current += 1;
        setSaving({ kind: "saved", n: saves.current });
      },
      (error: unknown) => {
        setSaving({ kind: "failed", message: describeError(error) });
      },
    );
  };
  const unsaved =
    !savedQuery || sql.trim() !== savedQuery.sql || savedQuery.connections[0]?.id !== connectionId;

  // The latest `start`, for the effect below, which runs once rather than on every render.
  const startLatest = useRef(start);
  useEffect(() => {
    startLatest.current = start;
  });
  // Runs the saved query just opened, once its database is picked; it isn't when it has none
  // the person can explore.
  useEffect(() => {
    if (!savedQuery || runOnOpen.current !== savedQuery.id) return;
    // Only on its own database, not on the first one, picked when its own is gone.
    if (!connectionId || savedQuery.connections[0]?.id !== connectionId) return;
    runOnOpen.current = undefined;
    startLatest.current(savedQuery.sql);
  }, [savedQuery, connectionId]);

  // What was run on another database than the one picked now, as after going back, isn't shown.
  const shown = outcome?.connectionId === connection?.id ? outcome : undefined;
  const answer = shown?.answer;

  // Reads the page after the rows shown, if there's one to read and nothing's reading it yet,
  // and adds its rows to theirs. One that failed is read again only when asked to.
  const loadMore = (retry = false) => {
    if (shown?.answer.kind !== "done" || page.current) return;
    if (paging.kind === "failed" && !retry) return;
    const { result } = shown.answer;
    if (!result.truncated || result.rows.length >= MAX_QUERY_ROWS) return;
    const id = newRunId();
    page.current = id;
    setPaging({ kind: "loading" });
    const { n } = shown;
    runQuery(shown.connectionId, shown.sql, id, result.rows.length).then(
      (next) => {
        if (page.current !== id) return;
        page.current = undefined;
        setPaging({ kind: "idle" });
        setOutcome((last) =>
          last?.n === n && last.answer.kind === "done"
            ? {
                ...last,
                answer: {
                  kind: "done",
                  result: {
                    ...last.answer.result,
                    rows: [...last.answer.result.rows, ...next.rows],
                    truncated: next.truncated,
                  },
                },
              }
            : last,
        );
      },
      (error: unknown) => {
        if (page.current !== id) return;
        page.current = undefined;
        setPaging({ kind: "failed", message: describeError(error) });
      },
    );
  };

  return (
    <div className="grid gap-4">
      {/* No heading in sight: the page is all data, and the header says where it is. */}
      <h1 className="sr-only">Explore</h1>

      {connections.kind === "loading" && <Loading />}
      {connections.kind === "failed" && (
        <p role="alert" className="animate-fade-in text-sm text-destructive">
          Couldn't load databases: {connections.message}
        </p>
      )}
      {connections.kind === "loaded" && list.length === 0 && <NoDatabases isAdmin={isAdmin} />}

      {list.length > 0 && (
        <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
          {/* One column as wide as the aside, so a long table name is cut short, not widening it. */}
          <aside className="grid grid-cols-1 content-start gap-3">
            <DatabaseSelect
              connections={list}
              value={connection?.name}
              onChange={(name) => {
                stop();
                // A saved query opened without its database isn't run on the one picked instead.
                runOnOpen.current = undefined;
                setOutcome(undefined);
                setStatus("idle");
                navigate(explorePath(name, queryId));
              }}
            />

            {tables.kind === "loading" && <Loading />}
            {tables.kind === "failed" && (
              <p role="alert" className="animate-fade-in text-sm text-destructive">
                Couldn't list tables: {tables.message}
              </p>
            )}
            {tables.kind === "loaded" && connection && (
              <TableList
                connection={connection.name}
                tables={tables.value}
                onOpen={(t) => {
                  const text = `select * from ${sqlTableName(t)}`;
                  setSql(text);
                  // What's still running was for other SQL, which isn't there any more.
                  stop();
                  start(text);
                }}
              />
            )}
          </aside>

          <div className="grid min-w-0 content-start gap-4">
            {openError?.id === queryId && (
              <p role="alert" className="animate-fade-in text-sm text-destructive">
                Couldn't open the saved query: {openError.message}
              </p>
            )}
            {savedQuery && (
              <div className="flex animate-fade-in flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium">{savedQuery.name}</h2>
                <ScopeBadge scope={savedQuery.scope} />
                {!savedQuery.canEdit && (
                  <span className="text-xs text-muted-foreground">
                    Only its owner or an editor can change it; save it as yours instead.
                  </span>
                )}
              </div>
            )}
            {chosenName !== null && !connection && (
              <p className="text-sm text-muted-foreground">
                There's no database called {chosenName} to explore.
              </p>
            )}
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                start();
              }}
            >
              <SqlEditor
                ref={editor}
                label="SQL"
                value={sql}
                onChange={setSql}
                onRun={start}
                tables={tables.kind === "loaded" ? tables.value : undefined}
                placeholder="select * from …, or choose a table"
              />
              <div className="flex flex-wrap items-center gap-3">
                {status === "running" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      stop();
                      setStatus("cancelled");
                    }}
                  >
                    <SquareIcon aria-hidden="true" />
                    Cancel
                  </Button>
                ) : (
                  <Button type="submit" disabled={!connection || !sql.trim()}>
                    <PlayIcon aria-hidden="true" />
                    Run
                  </Button>
                )}
                {/* Starts over: no SQL, no result and no saved query open, with what's running
                    cancelled. */}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!sql && !shown && status === "idle" && !queryId}
                  onClick={() => {
                    stop();
                    setSql("");
                    setOutcome(undefined);
                    setStatus("idle");
                    setSaving({ kind: "idle" });
                    runOnOpen.current = undefined;
                    if (queryId) navigate(explorePath(connection?.name, null));
                    editor.current?.focus();
                  }}
                >
                  <EraserIcon aria-hidden="true" />
                  Clear
                </Button>
                {/* Over the saved query open, when `user` can change it; else as a new one. */}
                {savedQuery?.canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!unsaved || !connection || !sql.trim() || saving.kind === "saving"}
                    onClick={saveChanges}
                  >
                    <SaveIcon aria-hidden="true" />
                    Save
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!connection || !sql.trim()}
                  onClick={() => {
                    setSaveDialog(true);
                  }}
                >
                  {!savedQuery && <SaveIcon aria-hidden="true" />}
                  {savedQuery ? "Save as…" : "Save…"}
                </Button>
                {/* Keyed by what it says, so each change fades in; the hint as the page opens
                    fades in with the page. */}
                <span
                  key={status}
                  className={cn(
                    "flex items-center gap-2 text-xs text-muted-foreground",
                    (status !== "idle" || outcome) && "animate-fade-in",
                  )}
                >
                  {status === "running" && (
                    <>
                      <Spinner className="size-3.5" /> Running…
                    </>
                  )}
                  {status === "cancelled" && "The query was cancelled."}
                  {status === "idle" && `${modifierKey()} Enter to execute`}
                </span>
                {saving.kind === "saving" && (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                )}
                {saving.kind === "saved" && !unsaved && (
                  <span key={saving.n} className="animate-fade-in text-xs text-muted-foreground">
                    Saved.
                  </span>
                )}
                {saving.kind === "failed" && (
                  <span role="alert" className="animate-fade-in text-xs text-destructive">
                    Couldn't save: {saving.message}
                  </span>
                )}
              </div>
            </form>
            {saveDialog && connection && (
              <SaveQueryDialog
                user={user}
                sql={sql}
                connectionId={connection.id}
                initialName={savedQuery ? `${savedQuery.name} copy` : ""}
                onOpenChange={setSaveDialog}
                onSaved={(saved) => {
                  // It's open already, so there's nothing to load.
                  asked.current = saved.id;
                  setOpened(saved);
                  saves.current += 1;
                  setSaving({ kind: "saved", n: saves.current });
                  navigate(explorePath(connection.name, saved.id));
                }}
              />
            )}

            <section aria-label="Result" className="grid min-w-0 content-start gap-3">
              {answer?.kind === "failed" && (
                <p key={shown?.n} role="alert" className="animate-fade-in text-sm text-destructive">
                  Couldn't run the query: {answer.message}
                </p>
              )}
              {answer?.kind === "done" && (
                <div key={shown?.n} className="grid min-w-0 animate-fade-in gap-3">
                  <p className="text-sm text-muted-foreground">{describeResult(answer.result)}</p>
                  {answer.result.columns.length > 0 && (
                    <RowsGrid
                      data={answer.result}
                      label="Result"
                      sql={sql}
                      onNearEnd={() => {
                        loadMore();
                      }}
                    />
                  )}
                  {paging.kind === "loading" && (
                    <p className="flex animate-fade-in items-center gap-2 text-xs text-muted-foreground">
                      <Spinner className="size-3.5" /> Loading more rows…
                    </p>
                  )}
                  {paging.kind === "failed" && (
                    <div className="flex animate-fade-in flex-wrap items-center gap-3">
                      <p role="alert" className="text-sm text-destructive">
                        Couldn't load more rows: {paging.message}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          loadMore(true);
                        }}
                      >
                        Try again
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
