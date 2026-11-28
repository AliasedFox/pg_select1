import type {
  CatalogTable,
  ResultColumn,
  TargetCatalog,
  TargetFunction,
  TargetTableList,
} from "@pg_select1/shared";

import type { SessionUser } from "../../auth";
import type { Job } from "../../job";
import { cronEvery, scheduleJob } from "../../jobs";
import type { PooledTarget } from "../../targets";
import { explorableTarget, listTargets } from "../connection/service";
import { readSettings } from "../settings/service";
import { readOnly, readTableList, readTarget, relkinds } from "./service";

// A connection's tables with their columns, and its functions, as last read from its database,
// with when the connection's settings last changed as of that read, since a read from before
// then may be another database's.
interface Catalog {
  tables: CatalogTable[];
  functions: TargetFunction[];
  version: string;
}

// Every connection's catalog, by its id, in the API's memory: it's one process, and a restart
// reads them all again. Only the job fills it.
const catalogs = new Map<string, Catalog>();

// Reads what a connection's database has: the tables and functions the explorer lists, and
// every one of those tables' columns, in one query, put with their table by schema and name.
async function readCatalog(connection: PooledTarget): Promise<Catalog> {
  return readOnly(connection, async (client) => {
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
      version: connection.updatedAt.toISOString(),
    };
  });
}

/**
 * Reads every connection's catalog again, all at once since each is another database, and keeps
 * them in memory, forgetting those of connections that are gone. A database that can't be read
 * keeps the catalog read last, unless its connection has changed since, so completion goes on
 * working while it's down for a moment.
 */
export async function refreshCatalogs(): Promise<void> {
  const connections = await listTargets();
  const ids = new Set(connections.map((c) => c.id));
  for (const id of catalogs.keys()) if (!ids.has(id)) catalogs.delete(id);

  await Promise.all(
    connections.map(async (connection) => {
      try {
        catalogs.set(connection.id, await readCatalog(connection));
      } catch {
        // Not logged: an unreachable database would say so on every read, and the explorer
        // says why to whoever opens it.
        if (catalogs.get(connection.id)?.version !== connection.updatedAt.toISOString()) {
          catalogs.delete(connection.id);
        }
      }
    }),
  );
}

/**
 * Answers the tables and functions in a connection's database, as {@link readTableList} lists
 * them, read from it now.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection, and as {@link readTarget}.
 */
export async function listTables(
  connectionId: string,
  user: SessionUser,
): Promise<TargetTableList> {
  const connection = await explorableTarget(connectionId, user);
  return readTarget(connection, user, readTableList);
}

/**
 * Answers a connection's tables, each with its columns, and its functions, as the job last read
 * them. A connection added or changed since the job last read it has none yet: it reads them
 * on its next run, as often as the settings say, and the editor completes keywords meanwhile.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection.
 */
export async function catalogOf(connectionId: string, user: SessionUser): Promise<TargetCatalog> {
  const connection = await explorableTarget(connectionId, user);
  const catalog = catalogs.get(connection.id);
  if (catalog?.version !== connection.updatedAt.toISOString()) return { tables: [], functions: [] };
  return { tables: catalog.tables, functions: catalog.functions };
}

const REFRESH_JOB = "explore-refresh-catalogs";

/**
 * Reads every connection's catalog into memory as the API starts, and as often as the settings
 * say, every 15 minutes unless an admin changes it.
 */
export const refreshCatalogsJob: Job = {
  name: REFRESH_JOB,
  schedule: async () => cronEvery((await readSettings()).catalogRefreshMinutes),
  runOnStart: true,
  // One refresh at a time, and one waiting at most: a second waiting would read the same.
  queue: { policy: "stately" },
  handler: refreshCatalogs,
};

/**
 * Reads every connection's catalog every `minutes` from now on, as when an admin changes how
 * often.
 *
 * @throws {Error} as {@link cronEvery}, for minutes a cron step can't keep to.
 */
export async function scheduleCatalogRefresh(minutes: number): Promise<void> {
  await scheduleJob(REFRESH_JOB, cronEvery(minutes));
}
