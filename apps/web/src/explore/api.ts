import {
  type ExplorableConnection,
  explorableConnectionList,
  type TableRows,
  tableRows,
  type TargetTable,
  targetTableList,
} from "@pg_select1/shared";

import { callApi } from "@/lib/api";

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

/** Asks the API for a table's columns and its rows, up to the API's row cap. */
export function fetchRows(connectionId: string, schema: string, table: string): Promise<TableRows> {
  const query = new URLSearchParams({ schema, table });
  return callApi("GET", `/api/explore/connections/${connectionId}/rows?${query}`, tableRows);
}
