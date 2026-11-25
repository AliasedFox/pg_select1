import {
  type ExplorableConnection,
  explorableConnectionList,
  type QueryResult,
  queryResult,
  type TargetTable,
  targetTableList,
} from "@pg_select1/shared";

import { callApi, sendApi } from "@/lib/api";

/** Asks the API for the connections the signed-in user can explore, by name. */
export async function fetchExplorableConnections(): Promise<ExplorableConnection[]> {
  const { connections } = await callApi(
    "GET",
    "/api/explore/connections",
    explorableConnectionList,
  );
  return connections;
}

/** Asks the API for the tables and views in a connection's database, by schema then name. */
export async function fetchTables(connectionId: string): Promise<TargetTable[]> {
  const { tables } = await callApi(
    "GET",
    `/api/explore/connections/${connectionId}/tables`,
    targetTableList,
  );
  return tables;
}

/**
 * Asks the API to run one SQL statement on a connection's database, read-only, and answers its
 * columns and a page of its rows, up to the API's row cap, after the first `offset`. `runId` is
 * what {@link cancelQuery} cancels it by.
 */
export function runQuery(
  connectionId: string,
  sql: string,
  runId: string,
  offset = 0,
): Promise<QueryResult> {
  return callApi("POST", `/api/explore/connections/${connectionId}/query`, queryResult, {
    sql,
    runId,
    ...(offset > 0 && { offset }),
  });
}

/** Asks the API to cancel the query run as `runId`, if it's still running. */
export async function cancelQuery(runId: string): Promise<void> {
  await sendApi("POST", `/api/explore/queries/${runId}/cancel`);
}
