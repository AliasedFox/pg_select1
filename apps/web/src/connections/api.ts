import {
  type Connection,
  connection,
  connectionList,
  type CreateConnectionRequest,
  type TestConnectionRequest,
  type TestConnectionResult,
  testConnectionResult,
  type UpdateConnectionRequest,
} from "@pg_select1/shared";

import { callApi, sendApi } from "@/lib/api";

/** Asks the API for every connection, by name. Admins only. */
export async function fetchConnections(): Promise<Connection[]> {
  const { connections } = await callApi("GET", "/api/connections", connectionList);
  return connections;
}

/** Adds a connection. */
export function createConnection(input: CreateConnectionRequest): Promise<Connection> {
  return callApi("POST", "/api/connections", connection, input);
}

/** Changes a connection's settings, password or visibility. */
export function updateConnection(
  id: string,
  changes: UpdateConnectionRequest,
): Promise<Connection> {
  return callApi("PATCH", `/api/connections/${id}`, connection, changes);
}

/** Deletes a connection. */
export async function deleteConnection(id: string): Promise<void> {
  await sendApi("DELETE", `/api/connections/${id}`);
}

/** Tries connecting to a saved connection's database from pg_select1's server. */
export function testConnection(id: string): Promise<TestConnectionResult> {
  return callApi("POST", `/api/connections/${id}/test`, testConnectionResult);
}

/** Tries connecting with settings that may not be saved yet, as a form has them. */
export function testSettings(input: TestConnectionRequest): Promise<TestConnectionResult> {
  return callApi("POST", "/api/connections/test", testConnectionResult, input);
}
