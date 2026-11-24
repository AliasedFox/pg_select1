import type { ResultColumn, TableKind, TableRows, TargetTable } from "@pg_select1/shared";
import { DatabaseError, escapeIdentifier, type PoolClient } from "pg";

import type { SessionUser } from "../../auth";
import { HttpError } from "../../endpoint";
import { ConnectError, type PooledTarget, withTarget } from "../../targets";
import { describeConnectError, explorableTarget } from "../connection/service";

/** The most rows a table's page shows; the rest aren't read. */
export const ROW_CAP = 1000;

/** How long a read of a target may take before Postgres cancels it. */
export const STATEMENT_TIMEOUT_MS = 30_000;

// `pg_class.relkind`s the explorer lists, and what it calls them.
const kinds: Record<string, TableKind> = {
  r: "table",
  v: "view",
  m: "materialized view",
  p: "partitioned table",
  f: "foreign table",
};
const relkinds = Object.keys(kinds);

// Every value as Postgres prints it, rather than as `pg` would parse it (dates into `Date`s in
// the API's time zone, `bytea` into `Buffer`s), so the explorer shows what's in the database.
const asText = { getTypeParser: () => (value: string) => value };

/**
 * Runs `work` on a connection's database, in a `READ ONLY` transaction with a statement timeout
 * that is rolled back after, whatever `work` sends.
 *
 * @throws {HttpError} a 502 when the database can't be reached or refuses (saying why to an
 *   admin only, since why names its host, port and user), and a 504 when it takes longer than
 *   {@link STATEMENT_TIMEOUT_MS}.
 */
async function readTarget<T>(
  connection: PooledTarget,
  user: SessionUser,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  try {
    return await withTarget(connection, async (client) => {
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const answer = await work(client);
      await client.query("ROLLBACK");
      return answer;
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof ConnectError) {
      throw new HttpError(
        502,
        user.role === "admin"
          ? describeConnectError(error.cause, connection.target)
          : `${connection.name} can't be reached right now. An admin can test its connection.`,
      );
    }
    // 57014 is query_canceled, which the statement timeout raises.
    if (error instanceof DatabaseError && error.code === "57014") {
      throw new HttpError(
        504,
        `The database didn't answer within ${STATEMENT_TIMEOUT_MS / 1000} seconds`,
      );
    }
    // Once connected, Postgres's errors are about the query, like a table the role can't read.
    if (error instanceof DatabaseError) throw new HttpError(502, error.message);
    throw error;
  }
}

/**
 * Answers the tables, views, materialized views, partitioned and foreign tables in a
 * connection's database, outside Postgres's own schemas, by schema then name. Partitions are
 * left out, since their parent holds their rows.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection, and as {@link readTarget}.
 */
export async function listTables(connectionId: string, user: SessionUser): Promise<TargetTable[]> {
  const connection = await explorableTarget(connectionId, user);
  return readTarget(connection, user, async (client) => {
    const { rows } = await client.query<{ schema: string; name: string; relkind: string }>(
      `SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS relkind
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind::text = ANY($1)
          AND NOT c.relispartition
          AND n.nspname !~ '^pg_'
          AND n.nspname <> 'information_schema'
        ORDER BY n.nspname, c.relname`,
      [relkinds],
    );
    return rows.map(({ schema, name, relkind }) => ({
      schema,
      name,
      kind: kinds[relkind] ?? "table",
    }));
  });
}

/**
 * Answers a table's columns, with their types, and up to {@link ROW_CAP} of its rows, in no
 * particular order, each value as Postgres prints it.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection or there's no such table,
 *   and as {@link readTarget}.
 */
export async function readTable(
  connectionId: string,
  schema: string,
  table: string,
  user: SessionUser,
): Promise<TableRows> {
  const connection = await explorableTarget(connectionId, user);
  return readTarget(connection, user, async (client) => {
    const relation = await client.query<{ oid: number }>(
      `SELECT c.oid
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind::text = ANY($3)`,
      [schema, table, relkinds],
    );
    const oid = relation.rows[0]?.oid;
    if (oid === undefined) throw new HttpError(404, `There's no table ${schema}.${table}`);

    const columns = await client.query<ResultColumn>(
      `SELECT attname AS name, pg_catalog.format_type(atttypid, atttypmod) AS type
         FROM pg_catalog.pg_attribute
        WHERE attrelid = $1 AND attnum > 0 AND NOT attisdropped
        ORDER BY attnum`,
      [oid],
    );
    // One row past the cap says whether there are more, without counting them all.
    const { rows } = await client.query<(string | null)[]>({
      text: `SELECT * FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)} LIMIT ${ROW_CAP + 1}`,
      rowMode: "array",
      types: asText,
    });
    return {
      columns: columns.rows,
      rows: rows.slice(0, ROW_CAP),
      truncated: rows.length > ROW_CAP,
      rowCap: ROW_CAP,
    };
  });
}
