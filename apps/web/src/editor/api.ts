import { type QueryResult, queryResult } from "@pg_select1/shared";

import { callApi, sendApi } from "@/lib/api";

/**
 * Asks the API to run one SQL statement on a connection's database, read-only, and answers its
 * columns and rows, up to the API's row cap. `runId` is what {@link cancelQuery} cancels it by.
 */
export function runQuery(connectionId: string, sql: string, runId: string): Promise<QueryResult> {
  return callApi("POST", `/api/explore/connections/${connectionId}/query`, queryResult, {
    sql,
    runId,
  });
}

/** Asks the API to cancel the query run as `runId`, if it's still running. */
export async function cancelQuery(runId: string): Promise<void> {
  await sendApi("POST", `/api/explore/queries/${runId}/cancel`);
}
