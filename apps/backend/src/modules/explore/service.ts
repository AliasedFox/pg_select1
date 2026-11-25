import type {
  QueryResult,
  ResultColumn,
  TableKind,
  TableRows,
  TargetTable,
} from "@pg_select1/shared";
import { DatabaseError, escapeIdentifier, type FieldDef, type PoolClient } from "pg";
import Cursor from "pg-cursor";

import type { SessionUser } from "../../auth";
import { HttpError } from "../../endpoint";
import { ConnectError, type PooledTarget, withTarget } from "../../targets";
import { describeConnectError, explorableTarget } from "../connection/service";

/** The most rows a table's page or a query shows; the rest aren't read. */
export const ROW_CAP = 1000;

/** How long a read of a target, or a query, may take before Postgres cancels it. */
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

// Reads up to `count` rows of a statement through a cursor, so a statement of millions of rows
// sends only those, and answers them with the statement's columns. The extended protocol it uses
// takes one statement, so SQL holding several is refused rather than run.
function readCursor(
  client: PoolClient,
  sql: string,
  count: number,
): Promise<{ rows: (string | null)[][]; fields: FieldDef[] }> {
  const cursor = client.query(
    new Cursor<(string | null)[]>(sql, [], { rowMode: "array", types: asText }),
  );
  return new Promise((resolve, reject) => {
    cursor.read(count, (error, rows, result) => {
      if (error) {
        reject(error);
        return;
      }
      cursor.close().then(() => {
        resolve({ rows, fields: result.fields });
      }, reject);
    });
  });
}

// The queries running now that can be cancelled, by who runs them and the id of the run, so
// nobody cancels anyone else's. The API is one process, so they're kept in its memory.
const running = new Map<string, AbortController>();

function runKey(runId: string, user: SessionUser): string {
  return `${user.id}:${runId}`;
}

/**
 * Cancels a query `user` is running, by the id they gave it, if it's still running; a run that
 * has ended or never started is left alone, since the person can't tell those from a race.
 */
export function cancelQuery(runId: string, user: SessionUser): void {
  running.get(runKey(runId, user))?.abort();
}

/**
 * Runs one SQL statement on a connection's database, in a `READ ONLY` transaction that's rolled
 * back after, and answers the columns it returns, with their types, and up to {@link ROW_CAP} of
 * its rows, each value as Postgres prints it. Given a `runId`, the run can be cancelled with
 * {@link cancelQuery} until it ends, which cancels the statement with `pg_cancel_backend`.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection, a 400 for SQL of several
 *   statements, a 409 when `user` is already running a query with that `runId`, a 499 when it's
 *   cancelled, a 502 when the database refuses the statement, saying why, and as
 *   {@link readTarget}.
 */
export async function runQuery(
  connectionId: string,
  sql: string,
  user: SessionUser,
  runId?: string,
): Promise<QueryResult> {
  const connection = await explorableTarget(connectionId, user);
  const key = runId === undefined ? undefined : runKey(runId, user);
  if (key !== undefined && running.has(key)) {
    throw new HttpError(409, "A query with that id is running already");
  }
  const stop = new AbortController();
  if (key !== undefined) running.set(key, stop);
  try {
    return await runStatement(connection, sql, user, stop.signal);
  } finally {
    if (key !== undefined) running.delete(key);
  }
}

// Runs the statement for {@link runQuery}, cancelling it on the database when `signal` aborts.
function runStatement(
  connection: PooledTarget,
  sql: string,
  user: SessionUser,
  signal: AbortSignal,
): Promise<QueryResult> {
  return readTarget(connection, user, async (client) => {
    const backend = await client.query<{ pid: number }>(
      "SELECT pg_catalog.pg_backend_pid() AS pid",
    );
    const pid = backend.rows[0]?.pid;
    // A cancel comes from another client of the pool, since a role may cancel its own backends.
    let cancelling: Promise<unknown> | undefined;
    const cancel = () => {
      cancelling = withTarget(connection, (other) =>
        other.query("SELECT pg_catalog.pg_cancel_backend($1)", [pid]),
      ).catch(() => {
        // The statement still ends at the statement timeout.
      });
    };
    signal.addEventListener("abort", cancel, { once: true });

    let read: Awaited<ReturnType<typeof readCursor>>;
    const started = performance.now();
    try {
      if (signal.aborted) throw new HttpError(499, "The query was cancelled");
      // One row past the cap says whether there are more, as for a table.
      read = await readCursor(client, sql, ROW_CAP + 1);
    } catch (error) {
      if (signal.aborted) throw new HttpError(499, "The query was cancelled");
      if (error instanceof DatabaseError && error.message.includes("multiple commands")) {
        throw new HttpError(400, "Run one statement at a time");
      }
      throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
      // Before the client goes back to the pool, so a late cancel can't reach its next query.
      await cancelling;
    }
    const durationMs = Math.round(performance.now() - started);

    const types = await client.query<{ type: string }>(
      `SELECT pg_catalog.format_type(t.oid, t.mod) AS type
         FROM unnest($1::oid[], $2::int4[]) WITH ORDINALITY AS t(oid, mod, n)
        ORDER BY t.n`,
      [read.fields.map((f) => f.dataTypeID), read.fields.map((f) => f.dataTypeModifier)],
    );
    return {
      columns: read.fields.map((field, index) => ({
        name: field.name,
        type: types.rows[index]?.type ?? "unknown",
      })),
      rows: read.rows.slice(0, ROW_CAP),
      truncated: read.rows.length > ROW_CAP,
      rowCap: ROW_CAP,
      durationMs,
    };
  });
}
