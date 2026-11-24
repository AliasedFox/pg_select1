import type {
  Connection,
  createConnectionRequest,
  SslMode,
  testConnectionRequest,
  TestConnectionResult,
  updateConnectionRequest,
} from "@pg_select1/shared";
import { Client, type ClientConfig } from "pg";
import type { z } from "zod";

import { decryptSecret, encryptSecret } from "../../crypto";
import { db } from "../../db";
import { HttpError } from "../../endpoint";

const connectionFields = [
  "id",
  "name",
  "host",
  "port",
  "database",
  "username",
  "encryptedPassword",
  "sslMode",
  "visible",
  "createdAt",
  "updatedAt",
] as const;

interface ConnectionRow {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  encryptedPassword: string | null;
  sslMode: SslMode;
  visible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Where a database is and who to connect to it as, with the password in plain text. */
export interface Target {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string | undefined;
  sslMode: SslMode;
}

// How long a test waits for a database to answer, connecting and then querying.
const TEST_TIMEOUT_MS = 10_000;

function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    hasPassword: row.encryptedPassword !== null,
    sslMode: row.sslMode,
    visible: row.visible,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findConnection(id: string): Promise<ConnectionRow> {
  const row = await db.orm.public.Connection.select(...connectionFields).first({ id });
  if (!row) throw new HttpError(404, "There's no such connection");
  return row;
}

async function ensureNameIsFree(name: string, exceptId?: string): Promise<void> {
  const existing = await db.orm.public.Connection.select("id").first({ name });
  if (existing && existing.id !== exceptId) {
    throw new HttpError(409, `There's already a connection called ${name}`);
  }
}

/**
 * The `pg` settings to open a connection to a target with, as pg_select1 always does: with its
 * own `application_name`, so the target's `pg_stat_activity` shows who's asking.
 */
export function clientConfig(target: Target): ClientConfig {
  return {
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.username,
    password: target.password,
    application_name: "pg_select1",
    // `require` encrypts without checking who answers, like libpq's; `verify-full` checks the
    // certificate against the system's CAs and the host name, which Node does by default.
    ssl:
      target.sslMode === "disable"
        ? false
        : target.sslMode === "require"
          ? { rejectUnauthorized: false }
          : { rejectUnauthorized: true, servername: target.host },
  };
}

/**
 * Answers a connection's target with its password decrypted, in the API's memory only.
 *
 * @throws {Error} when the password was encrypted under another `PG_SELECT1_SECRET_KEY`.
 */
function targetOf(row: ConnectionRow): Target {
  return {
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    password: row.encryptedPassword === null ? undefined : decryptSecret(row.encryptedPassword),
    sslMode: row.sslMode,
  };
}

// What went wrong connecting, in words an admin can act on. Node reports a refused or unknown
// address by its code, and an address with both IPv4 and IPv6 as an AggregateError without a
// message; Postgres's own errors (a wrong password, no such database) say enough as they are.
function describeConnectError(error: unknown, target: Target): string {
  const first = error instanceof AggregateError ? (error.errors[0] as unknown) : error;
  const code = first instanceof Error && "code" in first ? first.code : undefined;
  const address = `${target.host}:${target.port}`;
  if (code === "ECONNREFUSED") return `Nothing is accepting connections at ${address}`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `There's no host called ${target.host}`;
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
    return `${address} can't be reached from pg_select1's server`;
  }
  const message = first instanceof Error ? first.message : "";
  if (/timeout/i.test(message)) {
    return `${address} didn't answer within ${TEST_TIMEOUT_MS / 1000} seconds`;
  }
  if (message === "The server does not support SSL connections") {
    return `${message}: set SSL to disable`;
  }
  if (/self[- ]signed certificate|unable to verify|certificate/i.test(message)) {
    return `${message}. To skip checking the certificate, set SSL to require`;
  }
  return message || "Couldn't connect";
}

/**
 * Tries connecting to a target from the API, the way pg_select1 will to query it, and asks for
 * the server's version, all within ten seconds.
 *
 * A failure is part of the answer rather than an error: it says why, as Postgres or the network
 * put it, never with the password.
 */
export async function testTarget(target: Target): Promise<TestConnectionResult> {
  const client = new Client({
    ...clientConfig(target),
    connectionTimeoutMillis: TEST_TIMEOUT_MS,
    statement_timeout: TEST_TIMEOUT_MS,
    query_timeout: TEST_TIMEOUT_MS,
  });
  client.on("error", () => {
    // An error after the test has its answer, like the server going away, has no one to tell.
  });
  const started = performance.now();
  try {
    await client.connect();
    const { rows } = await client.query<{ version: string }>(
      "SELECT current_setting('server_version') AS version",
    );
    return {
      ok: true,
      serverVersion: rows[0]?.version ?? "unknown",
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return { ok: false, error: describeConnectError(error, target) };
  } finally {
    await client.end().catch(() => {
      // Closing a connection that never opened fails too, and the answer already says why.
    });
  }
}

/** Answers every connection, by name, for an admin. */
export async function listConnections(): Promise<Connection[]> {
  const rows = await db.orm.public.Connection.select(...connectionFields)
    .orderBy((c) => c.name.asc())
    .all();
  return rows.map(toConnection);
}

/**
 * Adds a connection, encrypting its password. It doesn't try connecting: a database can be
 * added before it's up, and {@link testTarget} is there to check.
 *
 * @throws {HttpError} a 409 when another connection has the name.
 */
export async function createConnection(
  input: z.output<typeof createConnectionRequest>,
): Promise<Connection> {
  await ensureNameIsFree(input.name);
  const { password, ...settings } = input;
  const row = await db.orm.public.Connection.select(...connectionFields).create({
    ...settings,
    ...(password === undefined ? {} : { encryptedPassword: encryptSecret(password) }),
  });
  return toConnection(row);
}

/**
 * Changes a connection's settings, its password only when a new one is given, and whether it's
 * visible.
 *
 * @throws {HttpError} a 404 when there's no such connection, and a 409 when another one has the
 *   new name.
 */
export async function updateConnection(
  id: string,
  changes: z.output<typeof updateConnectionRequest>,
): Promise<Connection> {
  await findConnection(id);
  if (changes.name !== undefined) await ensureNameIsFree(changes.name, id);

  const { name, host, port, database, username, sslMode, password, visible } = changes;
  const updated = await db.orm.public.Connection.where({ id })
    .select(...connectionFields)
    .update({
      ...(name === undefined ? {} : { name }),
      ...(host === undefined ? {} : { host }),
      ...(port === undefined ? {} : { port }),
      ...(database === undefined ? {} : { database }),
      ...(username === undefined ? {} : { username }),
      ...(sslMode === undefined ? {} : { sslMode }),
      ...(visible === undefined ? {} : { visible }),
      ...(password === undefined ? {} : { encryptedPassword: encryptSecret(password) }),
    });
  if (!updated) throw new HttpError(404, "There's no such connection");
  return toConnection(updated);
}

/**
 * Deletes a connection and its encrypted password.
 *
 * @throws {HttpError} a 404 when there's no such connection.
 */
export async function deleteConnection(id: string): Promise<void> {
  await findConnection(id);
  await db.orm.public.Connection.where({ id }).delete();
}

/**
 * Tests a saved connection with its saved settings and password.
 *
 * @throws {HttpError} a 404 when there's no such connection.
 */
export async function testConnection(id: string): Promise<TestConnectionResult> {
  return testWithSaved(await findConnection(id), {});
}

/**
 * Tests settings before they're saved, as a form has them. Without a password, the one saved
 * for `connectionId` is used, if any.
 *
 * @throws {HttpError} a 404 when `connectionId` names no connection.
 */
export async function testSettings(
  input: z.output<typeof testConnectionRequest>,
): Promise<TestConnectionResult> {
  const { connectionId, ...target } = input;
  if (connectionId === undefined || target.password !== undefined) return testTarget(target);
  return testWithSaved(await findConnection(connectionId), target);
}

async function testWithSaved(
  row: ConnectionRow,
  overrides: Partial<Target>,
): Promise<TestConnectionResult> {
  let saved: Target;
  try {
    saved = targetOf(row);
  } catch {
    return {
      ok: false,
      error:
        "The saved password can't be decrypted, since PG_SELECT1_SECRET_KEY has changed. Enter it again.",
    };
  }
  return testTarget({ ...saved, ...overrides, password: saved.password });
}
