import type { SslMode } from "@pg_select1/shared";
import { type ClientConfig, Pool, type PoolClient } from "pg";

/** Where a database is and who to connect to it as, with the password in plain text. */
export interface Target {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string | undefined;
  sslMode: SslMode;
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

// A pool stays small, since each client is a backend on someone else's database, and lets its
// clients go after a minute without use.
const POOL_SIZE = 3;
const IDLE_MS = 60_000;
const CONNECT_TIMEOUT_MS = 10_000;

interface OpenPool {
  pool: Pool;
  // When the connection's settings last changed: a pool opened before then is out of date.
  version: string;
}

const pools = new Map<string, OpenPool>();

/** A connection to open a pool for: its id, its target, and when its settings last changed. */
export interface PooledTarget {
  id: string;
  target: Target;
  updatedAt: Date;
}

function poolFor({ id, target, updatedAt }: PooledTarget): Pool {
  const version = updatedAt.toISOString();
  const open = pools.get(id);
  if (open?.version === version) return open.pool;
  if (open) void open.pool.end();

  const pool = new Pool({
    ...clientConfig(target),
    max: POOL_SIZE,
    idleTimeoutMillis: IDLE_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    allowExitOnIdle: true,
  });
  pool.on("error", () => {
    // An idle client whose server went away; the pool drops it and the next query opens another.
  });
  pools.set(id, { pool, version });
  return pool;
}

/**
 * Runs `work` on a client from a connection's pool, opening the pool on first use and again
 * when the connection's settings have changed since, and gives the client back after.
 *
 * @throws {Error} as `pg` does, when the target can't be reached or `work` fails.
 */
export async function withTarget<T>(
  connection: PooledTarget,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await poolFor(connection).connect();
  let broken = false;
  try {
    return await work(client);
  } catch (error) {
    // A client whose query failed may be mid-transaction; a fresh one is safer than reusing it.
    broken = true;
    throw error;
  } finally {
    client.release(broken);
  }
}

/** Closes a connection's pool, if it has one, as when the connection is deleted. */
export async function closeTarget(id: string): Promise<void> {
  const open = pools.get(id);
  if (!open) return;
  pools.delete(id);
  await open.pool.end();
}
