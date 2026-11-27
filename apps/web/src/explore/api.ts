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

/**
 * Answers a random UUID to run a query as, and to cancel it by. Not `crypto.randomUUID`, which
 * needs a secure context, since pg_select1 may be served over plain HTTP on a local network.
 */
export function newRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Asks the API to cancel the query run as `runId`, if it's still running. */
export async function cancelQuery(runId: string): Promise<void> {
  await sendApi("POST", `/api/explore/queries/${runId}/cancel`);
}
