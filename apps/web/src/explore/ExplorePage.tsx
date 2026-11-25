import type { TargetTable } from "@pg_select1/shared";
import { useMemo } from "react";

import { Loading } from "@/components/Loading";
import { RowsGrid } from "@/components/RowsGrid";
import { useLoaded } from "@/lib/loaded";
import { navigate, useSearchParams } from "@/router";

import { fetchExplorableConnections, fetchRows, fetchTables } from "./api";
import { DatabaseSelect, NoDatabases } from "./DatabaseSelect";
import { TableList } from "./TableList";

// The explorer's address for a connection and, within it, a table.
function explorePath(connection: string, table?: TargetTable): string {
  const query = new URLSearchParams({ connection });
  if (table) {
    query.set("schema", table.schema);
    query.set("table", table.name);
  }
  return `/explore?${query}`;
}

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
      {connections.kind === "loaded" && list.length === 0 && <NoDatabases isAdmin={isAdmin} />}

      {list.length > 0 && (
        <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="grid content-start gap-3">
            <DatabaseSelect
              connections={list}
              value={connection?.name}
              onChange={(name) => {
                navigate(explorePath(name));
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
                current={schema && table ? { schema, name: table } : undefined}
                href={(t) => explorePath(connection.name, t)}
                onPick={(t) => {
                  navigate(explorePath(connection.name, t));
                }}
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
