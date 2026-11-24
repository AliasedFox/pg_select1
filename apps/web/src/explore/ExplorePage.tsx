import type { TableKind, TargetTable } from "@pg_select1/shared";
import { EyeIcon, LayersIcon, type LucideIcon, Table2Icon } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";

import { Loading } from "@/components/Loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { describeError } from "@/lib/api";
import { navigate, useSearchParams } from "@/router";

import { fetchExplorableConnections, fetchRows, fetchTables } from "./api";
import { RowsGrid } from "./RowsGrid";

type Loaded<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; value: T }
  | { kind: "failed"; message: string };

// Loads what `load` answers, again whenever it's another function, and nothing while it's null.
// What came back is kept with the function that asked, so an answer to an earlier choice never
// shows for a later one.
function useLoaded<T>(load: (() => Promise<T>) | null): Loaded<T> {
  const [result, setResult] = useState<{ load: () => Promise<T>; loaded: Loaded<T> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    load?.().then(
      (value) => {
        if (!cancelled) setResult({ load, loaded: { kind: "loaded", value } });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({ load, loaded: { kind: "failed", message: describeError(error) } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);
  if (!load) return { kind: "idle" };
  return result?.load === load ? result.loaded : { kind: "loading" };
}

// The explorer's address for a connection and, within it, a table.
function explorePath(connection: string, table?: TargetTable): string {
  const query = new URLSearchParams({ connection });
  if (table) {
    query.set("schema", table.schema);
    query.set("table", table.name);
  }
  return `/explore?${query}`;
}

const kindIcons: Record<TableKind, LucideIcon> = {
  table: Table2Icon,
  view: EyeIcon,
  "materialized view": LayersIcon,
  "partitioned table": Table2Icon,
  "foreign table": Table2Icon,
};

/**
 * The explorer: pick one of the databases the signed-in user can explore, then one of its tables,
 * and see the table's rows, up to the API's row cap. What's picked is kept in the address, so a
 * reload or a link opens the same table, and back goes to the one before.
 */
export function ExplorePage({ isAdmin }: { isAdmin: boolean }) {
  const params = useSearchParams();
  const connections = useLoaded(fetchExplorableConnections);
  const chosenName = params.get("connection");
  const schema = params.get("schema");
  const table = params.get("table");

  const list = connections.kind === "loaded" ? connections.value : [];
  // With only one database to explore, it's picked already.
  const connection =
    list.find((c) => c.name === chosenName) ??
    (chosenName === null && list.length === 1 ? list[0] : undefined);
  const connectionId = connection?.id;

  const loadTables = useMemo(
    () => (connectionId ? () => fetchTables(connectionId) : null),
    [connectionId],
  );
  const tables = useLoaded(loadTables);
  const loadRows = useMemo(
    () => (connectionId && schema && table ? () => fetchRows(connectionId, schema, table) : null),
    [connectionId, schema, table],
  );
  const rows = useLoaded(loadRows);

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
      {connections.kind === "loaded" && list.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {isAdmin ? (
            <>
              No databases to explore yet.{" "}
              <a
                href="/connections"
                className="font-medium text-foreground underline underline-offset-4"
                onClick={(event: MouseEvent) => {
                  event.preventDefault();
                  navigate("/connections");
                }}
              >
                Add a connection
              </a>{" "}
              first.
            </>
          ) : (
            "No databases to explore yet. Connections an admin makes visible will be here."
          )}
        </div>
      )}

      {list.length > 0 && (
        <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="grid content-start gap-3">
            <Select
              value={connection?.name ?? ""}
              onValueChange={(name) => {
                navigate(explorePath(name));
              }}
            >
              <SelectTrigger aria-label="Database" className="w-full font-mono">
                <SelectValue placeholder="Choose a database" />
              </SelectTrigger>
              <SelectContent position="popper">
                {list.map((c) => (
                  <SelectItem key={c.id} value={c.name} className="font-mono">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
                current={schema && table ? { schema, name: table } : undefined}
              />
            )}
          </aside>

          <section aria-label="Rows" className="grid min-w-0 content-start gap-3">
            {chosenName !== null && !connection && (
              <p className="text-sm text-muted-foreground">
                There's no database called {chosenName} to explore.
              </p>
            )}
            {connection && !(schema && table) && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Choose a table to see its rows.
              </div>
            )}
            {schema && table && rows.kind === "loading" && <Loading />}
            {schema && table && rows.kind === "failed" && (
              <p role="alert" className="animate-fade-in text-sm text-destructive">
                Couldn't read {schema}.{table}: {rows.message}
              </p>
            )}
            {schema && table && rows.kind === "loaded" && (
              <div className="grid min-w-0 animate-fade-in gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-mono font-semibold">
                    {schema}.{table}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {rows.value.truncated
                      ? `The first ${rows.value.rowCap.toLocaleString()} rows; there are more.`
                      : rows.value.rows.length === 1
                        ? "1 row"
                        : `${rows.value.rows.length.toLocaleString()} rows`}
                  </p>
                </div>
                <RowsGrid data={rows.value} label={`${schema}.${table}`} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// A connection's tables, under each schema's name, linking to their rows.
function TableList({
  connection,
  tables,
  current,
}: {
  connection: string;
  tables: TargetTable[];
  current?: { schema: string; name: string };
}) {
  if (tables.length === 0) {
    return (
      <p className="animate-fade-in text-sm text-muted-foreground">
        {connection} has no tables to show.
      </p>
    );
  }
  // The API answers tables by schema, so each schema's are together.
  const schemas = new Map<string, TargetTable[]>();
  for (const t of tables) {
    const inSchema = schemas.get(t.schema);
    if (inSchema) inSchema.push(t);
    else schemas.set(t.schema, [t]);
  }

  return (
    <nav
      aria-label="Tables"
      className="grid max-h-[calc(100svh-12rem)] animate-fade-in content-start gap-3 overflow-y-auto"
    >
      {[...schemas].map(([schema, inSchema]) => (
        <div key={schema}>
          <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{schema}</h3>
          <ul>
            {inSchema.map((t) => {
              const Icon = kindIcons[t.kind];
              const href = explorePath(connection, t);
              const isCurrent = current?.schema === t.schema && current.name === t.name;
              return (
                <li key={t.name}>
                  <a
                    href={href}
                    title={t.kind === "table" ? undefined : t.kind}
                    aria-current={isCurrent ? "page" : undefined}
                    className="relative flex items-center gap-2 rounded-md px-2 py-1 font-mono text-sm text-muted-foreground transition-colors outline-none before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent before:transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:text-foreground aria-[current=page]:before:bg-highlight"
                    onClick={(event: MouseEvent) => {
                      event.preventDefault();
                      navigate(href);
                    }}
                  >
                    <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{t.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
