import type {
  QueryResult,
  ResultColumn,
  TableKind,
  TableRows,
  TableStructure,
  TargetTableList,
} from "@pg_select1/shared";
import { DatabaseError, escapeIdentifier, type FieldDef, type PoolClient } from "pg";
import Cursor from "pg-cursor";

import type { SessionUser } from "../../auth";
import { HttpError } from "../../endpoint";
import { ConnectError, type PooledTarget, withTarget } from "../../targets";
import { describeConnectError, explorableTarget } from "../connection/service";

/** The most rows a table's page or a query's page shows; the rest aren't read. */
export const ROW_CAP = 200;

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
 * connection's database, outside Postgres's own schemas, by schema then name, and its functions
 * the same way. Partitions are left out, since their parent holds their rows, and so are the
 * functions of extensions, which can be hundreds (PostGIS's) and aren't the database's own.
 * Aggregates, window functions and procedures aren't functions here.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection, and as {@link readTarget}.
 */
export async function listTables(
  connectionId: string,
  user: SessionUser,
): Promise<TargetTableList> {
  const connection = await explorableTarget(connectionId, user);
  return readTarget(connection, user, async (client) => {
    const tables = await client.query<{ schema: string; name: string; relkind: string }>(
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
    const functions = await client.query<TargetTableList["functions"][number]>(
      `SELECT n.nspname AS schema, p.proname AS name,
              pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prokind = 'f'
          AND n.nspname !~ '^pg_'
          AND n.nspname <> 'information_schema'
          AND NOT EXISTS (SELECT FROM pg_catalog.pg_depend d
                           WHERE d.classid = 'pg_catalog.pg_proc'::regclass
                             AND d.objid = p.oid AND d.deptype = 'e')
        ORDER BY n.nspname, p.proname, arguments`,
    );
    return {
      tables: tables.rows.map(({ schema, name, relkind }) => ({
        schema,
        name,
        kind: kinds[relkind] ?? "table",
      })),
      functions: functions.rows,
    };
  });
}

/**
 * Answers how one of the functions {@link listTables} lists is defined, as the
 * `CREATE OR REPLACE FUNCTION` statement `pg_get_functiondef` writes, telling overloads apart by
 * their `args`, as {@link listTables} writes them.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection or there's no such
 *   function, and as {@link readTarget}.
 */
export async function defineFunction(
  connectionId: string,
  schema: string,
  name: string,
  args: string,
  user: SessionUser,
): Promise<{ definition: string }> {
  const connection = await explorableTarget(connectionId, user);
  return readTarget(connection, user, async (client) => {
    const { rows } = await client.query<{ definition: string }>(
      `SELECT pg_catalog.pg_get_functiondef(p.oid) AS definition
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1 AND p.proname = $2 AND p.prokind = 'f'
          AND pg_catalog.pg_get_function_identity_arguments(p.oid) = $3`,
      [schema, name, args],
    );
    const found = rows[0];
    if (!found) throw new HttpError(404, `There's no function ${schema}.${name}(${args})`);
    return found;
  });
}

// Answers the oid and `relkind` of one of the tables {@link listTables} lists.
async function findTable(
  client: PoolClient,
  schema: string,
  table: string,
): Promise<{ oid: number; relkind: string }> {
  const { rows } = await client.query<{ oid: number; relkind: string }>(
    `SELECT c.oid, c.relkind::text AS relkind
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind::text = ANY($3)`,
    [schema, table, relkinds],
  );
  const found = rows[0];
  if (!found) throw new HttpError(404, `There's no table ${schema}.${table}`);
  return found;
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
    const { oid } = await findTable(client, schema, table);
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

// `pg_constraint.contype`s the structure lists, and what it calls them. Not-null constraints
// (`n`, kept there since Postgres 18) are the columns' to say, and constraint triggers (`t`) are
// listed as triggers.
const constraintTypes: Record<string, TableStructure["constraints"][number]["type"]> = {
  p: "primary key",
  u: "unique",
  f: "foreign key",
  c: "check",
  x: "exclusion",
};

/**
 * Answers how one of a connection's tables is made: its columns, constraints, indexes, triggers
 * and the foreign keys that refer to it, a view's definition and a partitioned table's
 * partitions, as Postgres's catalog has them.
 *
 * @throws {HttpError} a 404 when `user` can't explore the connection or there's no such table,
 *   and as {@link readTarget}.
 */
export async function describeTable(
  connectionId: string,
  schema: string,
  table: string,
  user: SessionUser,
): Promise<TableStructure> {
  const connection = await explorableTarget(connectionId, user);
  return readTarget(connection, user, async (client) => {
    const { oid, relkind } = await findTable(client, schema, table);
    const about = await client.query<{
      comment: string | null;
      rowEstimate: number | null;
      size: string | null;
      definition: string | null;
      partitionKey: string | null;
    }>(
      `SELECT pg_catalog.obj_description(c.oid, 'pg_class') AS comment,
              -- -1 until the first ANALYZE, since Postgres 14; a partitioned table has none.
              CASE WHEN c.reltuples >= 0 AND c.relkind IN ('r', 'm')
                   THEN c.reltuples::float8 END AS "rowEstimate",
              CASE WHEN c.relkind IN ('r', 'm')
                   THEN pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) END
                AS size,
              CASE WHEN c.relkind IN ('v', 'm')
                   THEN pg_catalog.pg_get_viewdef(c.oid, true) END AS definition,
              CASE WHEN c.relkind = 'p'
                   THEN pg_catalog.pg_get_partkeydef(c.oid) END AS "partitionKey"
         FROM pg_catalog.pg_class c
        WHERE c.oid = $1`,
      [oid],
    );
    const columns = await client.query<TableStructure["columns"][number]>(
      `SELECT a.attname AS name,
              pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
              a.attnotnull AS "notNull",
              CASE
                WHEN a.attidentity = 'a' THEN 'generated always as identity'
                WHEN a.attidentity = 'd' THEN 'generated by default as identity'
                -- 's' is stored; 'v', from Postgres 18, is computed as it's read.
                WHEN a.attgenerated = 's'
                  THEN 'generated always as (' || pg_catalog.pg_get_expr(d.adbin, d.adrelid) || ') stored'
                WHEN a.attgenerated = 'v'
                  THEN 'generated always as (' || pg_catalog.pg_get_expr(d.adbin, d.adrelid) || ')'
                ELSE pg_catalog.pg_get_expr(d.adbin, d.adrelid)
              END AS "default",
              EXISTS (SELECT FROM pg_catalog.pg_constraint k
                       WHERE k.conrelid = a.attrelid AND k.contype = 'p'
                         AND a.attnum = ANY(k.conkey)) AS "primaryKey",
              pg_catalog.col_description(a.attrelid, a.attnum) AS comment
         FROM pg_catalog.pg_attribute a
         LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [oid],
    );
    const constraints = await client.query<{ name: string; type: string; definition: string }>(
      `SELECT conname AS name, contype::text AS type,
              pg_catalog.pg_get_constraintdef(oid, true) AS definition
         FROM pg_catalog.pg_constraint
        WHERE conrelid = $1 AND contype::text = ANY($2::text[])
        ORDER BY array_position($2::text[], contype::text), conname`,
      [oid, Object.keys(constraintTypes)],
    );
    const indexes = await client.query<TableStructure["indexes"][number]>(
      `SELECT i.relname AS name,
              pg_catalog.pg_get_indexdef(x.indexrelid) AS definition,
              x.indisprimary AS "primary",
              x.indisunique AS "unique",
              x.indisvalid AS valid,
              -- A partitioned table's index has no storage of its own.
              CASE WHEN i.relkind = 'i'
                   THEN pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(i.oid)) END AS size
         FROM pg_catalog.pg_index x
         JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
        WHERE x.indrelid = $1
        ORDER BY x.indisprimary DESC, i.relname`,
      [oid],
    );
    // Not the triggers Postgres keeps for itself, like those that check foreign keys.
    const triggers = await client.query<TableStructure["triggers"][number]>(
      `SELECT tgname AS name,
              pg_catalog.pg_get_triggerdef(oid, true) AS definition,
              tgenabled <> 'D' AS enabled
         FROM pg_catalog.pg_trigger
        WHERE tgrelid = $1 AND NOT tgisinternal
        ORDER BY tgname`,
      [oid],
    );
    // Not the copies Postgres makes of a partitioned table's foreign key for each partition.
    const referencedBy = await client.query<TableStructure["referencedBy"][number]>(
      `SELECT k.conname AS name, n.nspname AS schema, r.relname AS "table",
              pg_catalog.pg_get_constraintdef(k.oid, true) AS definition
         FROM pg_catalog.pg_constraint k
         JOIN pg_catalog.pg_class r ON r.oid = k.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = r.relnamespace
        WHERE k.contype = 'f' AND k.confrelid = $1 AND k.conparentid = 0
        ORDER BY n.nspname, r.relname, k.conname`,
      [oid],
    );
    const partitions =
      relkind === "p"
        ? await client.query<TableStructure["partitions"][number]>(
            `SELECT n.nspname AS schema, c.relname AS name,
                    pg_catalog.pg_get_expr(c.relpartbound, c.oid) AS bound
               FROM pg_catalog.pg_inherits i
               JOIN pg_catalog.pg_class c ON c.oid = i.inhrelid
               JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
              WHERE i.inhparent = $1
              ORDER BY n.nspname, c.relname`,
            [oid],
          )
        : { rows: [] };

    const { comment, rowEstimate, size, definition, partitionKey } = about.rows[0] ?? {
      comment: null,
      rowEstimate: null,
      size: null,
      definition: null,
      partitionKey: null,
    };
    return {
      schema,
      name: table,
      kind: kinds[relkind] ?? "table",
      comment,
      rowEstimate,
      size,
      columns: columns.rows,
      constraints: constraints.rows.map((c) => ({
        name: c.name,
        type: constraintTypes[c.type] ?? "check",
        definition: c.definition,
      })),
      indexes: indexes.rows,
      triggers: triggers.rows,
      referencedBy: referencedBy.rows,
      definition,
      partitionKey,
      partitions: partitions.rows,
    };
  });
}

// Reads up to `count` rows of a statement through a cursor, after skipping `skip` of them, so a
// statement of millions of rows sends only those, and answers them with the statement's columns.
// The rows skipped are read a page at a time and dropped. The extended protocol it uses takes one
// statement, so SQL holding several is refused rather than run.
async function readCursor(
  client: PoolClient,
  sql: string,
  skip: number,
  count: number,
): Promise<{ rows: (string | null)[][]; fields: FieldDef[] }> {
  const cursor = client.query(
    new Cursor<(string | null)[]>(sql, [], { rowMode: "array", types: asText }),
  );
  const read = (n: number) =>
    new Promise<{ rows: (string | null)[][]; fields: FieldDef[] }>((resolve, reject) => {
      cursor.read(n, (error, rows, result) => {
        if (error) reject(error);
        else resolve({ rows, fields: result.fields });
      });
    });
  try {
    let skipped = 0;
    while (skipped < skip) {
      const n = Math.min(ROW_CAP, skip - skipped);
      const page = await read(n);
      // The statement ended before the rows asked for: there are none.
      if (page.rows.length < n) return { rows: [], fields: page.fields };
      skipped += n;
    }
    return await read(count);
  } finally {
    await cursor.close();
  }
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
 * its rows after the first `offset`, each value as Postgres prints it. A page past the first runs
 * the statement again, so its rows follow the last page's only when the statement orders them
 * and the data hasn't changed. Given a `runId`, the run can be cancelled with
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
  offset = 0,
): Promise<QueryResult> {
  const connection = await explorableTarget(connectionId, user);
  const key = runId === undefined ? undefined : runKey(runId, user);
  if (key !== undefined && running.has(key)) {
    throw new HttpError(409, "A query with that id is running already");
  }
  const stop = new AbortController();
  if (key !== undefined) running.set(key, stop);
  try {
    return await runStatement(connection, sql, offset, user, stop.signal);
  } finally {
    if (key !== undefined) running.delete(key);
  }
}

// Runs the statement for {@link runQuery}, cancelling it on the database when `signal` aborts.
function runStatement(
  connection: PooledTarget,
  sql: string,
  offset: number,
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
    // A scan of a big table can start where another one running is, so the same statement would
    // answer its rows in another order each time. Off, a page's rows follow the last page's more
    // often for a statement that doesn't order them.
    await client.query("SET LOCAL synchronize_seqscans = off");

    let read: Awaited<ReturnType<typeof readCursor>>;
    const started = performance.now();
    try {
      if (signal.aborted) throw new HttpError(499, "The query was cancelled");
      // One row past the cap says whether there are more, as for a table.
      read = await readCursor(client, sql, offset, ROW_CAP + 1);
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
