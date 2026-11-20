import type { HealthResponse } from "@pg_select1/shared";

import packageJson from "../../../package.json" with { type: "json" };
import { db } from "../../db";

/**
 * Answers whether pg_select1 is up and can reach its own database, timing a `SELECT 1` on it.
 *
 * A database that can't be reached makes the status `error` rather than throwing.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const started = performance.now();
  let databaseOk = false;
  try {
    await db.query(db.raw.sql`SELECT 1 AS one`.returnsRow({ one: "pg/int4@1" }).build());
    databaseOk = true;
  } catch {
    // Reported as `database.ok: false`; the details stay in the server's logs, not the response.
  }
  return {
    status: databaseOk ? "ok" : "error",
    version: packageJson.version,
    database: {
      ok: databaseOk,
      latencyMs: databaseOk ? Math.round(performance.now() - started) : null,
    },
    time: new Date().toISOString(),
  };
}
