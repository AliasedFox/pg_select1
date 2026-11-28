import {
  type ExplorableConnection,
  explorableConnectionList,
  functionDefinition,
  type QueryResult,
  queryResult,
  type TableStructure,
  tableStructure,
  type TargetFunction,
  type TargetCatalog,
  targetCatalog,
  type TargetTable,
  targetTableList,
  type TargetTableList,
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

/**
 * Asks the API for the tables, views and functions in a connection's database, by schema then
 * name.
 */
export function fetchTables(connectionId: string): Promise<TargetTableList> {
  return callApi("GET", `/api/explore/connections/${connectionId}/tables`, targetTableList);
}

/**
 * Asks the API for a connection's tables, each with its columns, and its functions, as the API
 * keeps them in memory for the SQL editor to complete, read again every 15 minutes.
 */
export function fetchCatalog(connectionId: string): Promise<TargetCatalog> {
  return callApi("GET", `/api/explore/connections/${connectionId}/catalog`, targetCatalog);
}

/** Asks the API for a function's definition, as a `CREATE OR REPLACE FUNCTION` statement. */
export async function fetchFunctionDefinition(
  connectionId: string,
  fn: TargetFunction,
): Promise<string> {
  const query = new URLSearchParams({ schema: fn.schema, name: fn.name, arguments: fn.arguments });
  const { definition } = await callApi(
    "GET",
    `/api/explore/connections/${connectionId}/function?${query.toString()}`,
    functionDefinition,
  );
  return definition;
}

/**
 * Asks the API how one of a connection's tables is made: its columns, constraints, indexes,
 * triggers and the like, as the database's catalog has them.
 */
export function fetchStructure(connectionId: string, table: TargetTable): Promise<TableStructure> {
  const query = new URLSearchParams({ schema: table.schema, table: table.name });
  return callApi(
    "GET",
    `/api/explore/connections/${connectionId}/structure?${query.toString()}`,
    tableStructure,
  );
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
