import type { QueryResult, TargetTable } from "@pg_select1/shared";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { Loading } from "@/components/Loading";
import { RowsGrid } from "@/components/RowsGrid";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SqlEditor, type SqlEditorHandle } from "@/editor/SqlEditor";
import { describeError } from "@/lib/api";
import { useLoaded } from "@/lib/loaded";
import { modifierKey } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { navigate, useSearchParams } from "@/router";

import { cancelQuery, fetchExplorableConnections, fetchTables, runQuery } from "./api";
import { DatabaseSelect, NoDatabases } from "./DatabaseSelect";
import { TableList } from "./TableList";

type Answer = { kind: "done"; result: QueryResult } | { kind: "failed"; message: string };

// What the last run to end answered, kept on screen while the next one runs, rather than
// swapped for a spinner and back. `n` counts runs, so each answer fades in anew.
interface Outcome {
  answer: Answer;
  connectionId: string;
  n: number;
}

// Beside the Run button: nothing running, a run that's been going a while, or one cancelled.
type Status = "idle" | "running" | "cancelled";

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

// An identifier quoted, so any name works as it is: capitals, spaces, quotes or a keyword like `user`.
function sqlIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

// A table's name with its schema, which works whatever the connection's `search_path`.
function sqlName({ schema, name }: TargetTable): string {
  return `${sqlIdentifier(schema)}.${sqlIdentifier(name)}`;
}

// How many rows a result has, and how long the database took.
function describeResult({ columns, rows, truncated, rowCap, durationMs }: QueryResult): string {
  const took = `in ${durationMs.toLocaleString()} ms`;
  if (truncated) return `The first ${rowCap.toLocaleString()} rows ${took}; there are more.`;
  if (columns.length === 0) return `The statement ran ${took} and returns no rows.`;
  return `${rows.length === 1 ? "1 row" : `${rows.length.toLocaleString()} rows`} ${took}`;
}

/**
 * The explorer: pick one of the databases the signed-in user can explore, write a SQL statement
 * in the {@link SqlEditor} and run it there, read-only, to see its rows, up to the API's row cap.
 * The database's tables are listed beside it. Clicking one writes its name where the cursor is;
 * ⌘ or Ctrl-clicking it replaces the SQL with `select * from` it and runs that. While a query runs, the last result
 * stays on screen until the new one fades in over it. A run can be cancelled, and is when the
 * person picks another database or leaves the page. The database is kept in the address, so a
 * reload or a link opens the same one.
 */
export function ExplorePage({ isAdmin }: { isAdmin: boolean }) {
  const params = useSearchParams();
  const connections = useLoaded(fetchExplorableConnections);
  const chosenName = params.get("connection");
  const [sql, setSql] = useState("");
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const [status, setStatus] = useState<Status>("idle");
  const runs = useRef(0);
  // The run whose answer is still wanted, so a cancelled or replaced one's is dropped.
  const current = useRef<string | undefined>(undefined);
  const editor = useRef<SqlEditorHandle>(null);

  const list = connections.kind === "loaded" ? connections.value : [];
  // With only one database, it's picked already.
  const connection =
    list.find((c) => c.name === chosenName) ??
    (chosenName === null && list.length === 1 ? list[0] : undefined);
  const connectionId = connection?.id;

  const loadTables = useMemo(
    () => (connectionId ? () => fetchTables(connectionId) : null),
    [connectionId],
  );
  const tables = useLoaded(loadTables);

  const stop = () => {
    cancelCurrent(current);
  };
  // Leaving the page cancels what's running.
  useEffect(
    () => () => {
      cancelCurrent(current);
    },
    [],
  );

  // Runs `text`, the SQL as written unless given.
  const start = (text = sql) => {
    if (!connectionId || !text.trim() || current.current) return;
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
      setOutcome({ answer, connectionId, n: runs.current });
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

  // What was run on another database than the one picked now, as after going back, isn't shown.
  const shown = outcome?.connectionId === connection?.id ? outcome : undefined;
  const answer = shown?.answer;

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
        <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="grid content-start gap-3">
            <DatabaseSelect
              connections={list}
              value={connection?.name}
              onChange={(name) => {
                stop();
                setOutcome(undefined);
                setStatus("idle");
                navigate(`/explore?${new URLSearchParams({ connection: name })}`);
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
                onPick={(t, open) => {
                  if (!open) {
                    editor.current?.insert(sqlName(t));
                    return;
                  }
                  const text = `select * from ${sqlName(t)}`;
                  setSql(text);
                  // What's still running was for other SQL, which isn't there any more.
                  stop();
                  start(text);
                }}
              />
            )}
            {tables.kind === "loaded" && tables.value.length > 0 && (
              <p className="px-2 text-xs text-muted-foreground">
                {modifierKey()}-click to show all
              </p>
            )}
          </aside>

          <div className="grid min-w-0 content-start gap-4">
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
                    Cancel
                  </Button>
                ) : (
                  <Button type="submit" disabled={!connection || !sql.trim()}>
                    Run
                  </Button>
                )}
                {/* Starts over: no SQL and no result, with what's running cancelled. */}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!sql && !shown && status === "idle"}
                  onClick={() => {
                    stop();
                    setSql("");
                    setOutcome(undefined);
                    setStatus("idle");
                    editor.current?.focus();
                  }}
                >
                  Clear
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
                  {status === "idle" && `${modifierKey()} Enter runs it, read-only`}
                </span>
              </div>
            </form>

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
                    <RowsGrid data={answer.result} label="Result" className="h-[60svh]" />
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
