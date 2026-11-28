import type { ResultColumn, TargetCatalog, TargetTableList } from "@pg_select1/shared";
import type { PoolClient } from "pg";

import type { SessionUser } from "../../auth";
import type { Job } from "../../job";
import type { PooledTarget } from "../../targets";
import { explorableTarget, listTargets } from "../connection/service";
import { readOnly, readTableList, readTarget, relkinds } from "./service";

// What the index holds for a connection: its catalog, and when the connection's settings last
// changed as of reading it, since one read before then may be another database's.
interface Indexed {
  version: string;
  catalog: TargetCatalog;
}

// Every connection's catalog, by its id, in the API's memory: it's one process, and a restart
// reads them all again. Filled as the job runs, as the explorer lists a connection's tables and
// as someone asks for one that isn't there.
const index = new Map<string, Indexed>();

// Reads what a connection's database has: the tables and functions the explorer lists, and
// every one of those tables' columns, in one query, put with their table by schema and name.
async function readCatalog(client: PoolClient): Promise<TargetCatalog> {
  const { tables, functions } = await readTableList(client);
  const { rows } = await client.query<{ schema: string; table: string } & ResultColumn>(
    `SELECT n.nspname AS schema, c.relname AS "table", a.attname AS name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind::text = ANY($1)
        AND NOT c.relispartition
        AND n.nspname !~ '^pg_'
        AND n.nspname <> 'information_schema'
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY n.nspname, c.relname, a.attnum`,
    [relkinds],
  );
  // A table's key can't be another's: neither a schema's name nor a table's holds a NUL.
  const columns = new Map<string, ResultColumn[]>();
  for (const { schema, table, name, type } of rows) {
    const key = `${schema}\0${table}`;
    let list = columns.get(key);
    if (!list) columns.set(key, (list = []));
    list.push({ name, type });
  }
  return {
    tables: tables.map((t) => ({ ...t, columns: columns.get(`${t.schema}\0${t.name}`) ?? [] })),
    functions,
    refreshedAt: new Date().toISOString(),
  };
}

function remember(connection: PooledTarget, catalog: TargetCatalog): TargetCatalog {
  index.set(connection.id, { version: connection.updatedAt.toISOString(), catalog });
  return catalog;
}

/**
 * Reads every connection's catalog again, all at once since each is another database, and keeps
 * them in the index, forgetting those of connections that are gone. A database that can't be
 * read keeps the catalog read last, unless its connection has changed since, so completion goes
 * on working while it's down for a moment.
 */
export async function refreshCatalogs(): Promise<void> {
  const connections = await listTargets();
  const ids = new Set(connections.map((c) => c.id));
  for (const id of index.keys()) if (!ids.has(id)) index.delete(id);

  await Promise.all(
    connections.map(async (connection) => {
      try {
        remember(connection, await readOnly(connection, readCatalog));
      } catch {
        // Not logged: an unreachable database would say so every 15 minutes, and the explorer
        // says why to whoever opens it.
        if (index.get(connection.id)?.version !== connection.updatedAt.toISOString()) {
          index.delete(connection.id);
        }
      }
    }),
  );
}

/**
 * Answers the tables and functions in a connection's database, as {@link readTableList} lists
 * them, read from it now rather than from the index. It reads their columns too and keeps it all
 * in the index, so the SQL editor completes a table as soon as the explorer lists it, without
 * waiting for the job.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection, and as {@link readTarget}.
 */
export async function listTables(
  connectionId: string,
  user: SessionUser,
): Promise<TargetTableList> {
  const connection = await explorableTarget(connectionId, user);
  const { tables, functions } = remember(
    connection,
    await readTarget(connection, user, readCatalog),
  );
  return { tables: tables.map(({ columns: _, ...table }) => table), functions };
}

/**
 * Answers a connection's tables, each with its columns, and its functions, from the index, or
 * read from its database and kept there when the index has none for it yet, as for a connection
 * added or changed since the job last ran.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection, and as {@link readTarget}.
 */
export async function catalogOf(connectionId: string, user: SessionUser): Promise<TargetCatalog> {
  const connection = await explorableTarget(connectionId, user);
  const indexed = index.get(connection.id);
  if (indexed?.version === connection.updatedAt.toISOString()) return indexed.catalog;
  return remember(connection, await readTarget(connection, user, readCatalog));
}

/** Reads every connection's catalog into the index as the API starts, and every 15 minutes. */
export const refreshCatalogsJob: Job = {
  name: "explore-refresh-catalogs",
  schedule: "*/15 * * * *",
  runOnStart: true,
  // One refresh at a time, and one waiting at most: a second waiting would read the same.
  queue: { policy: "stately" },
  handler: refreshCatalogs,
};
