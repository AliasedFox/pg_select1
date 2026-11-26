import {
  type CreateSavedQueryRequest,
  type SavedQuery,
  savedQuery,
  savedQueryList,
  type UpdateSavedQueryRequest,
} from "@pg_select1/shared";

import { callApi, sendApi } from "@/lib/api";

/** Asks the API for the saved queries the signed-in user sees, by name. */
export async function fetchSavedQueries(): Promise<SavedQuery[]> {
  const { savedQueries } = await callApi("GET", "/api/saved-queries", savedQueryList);
  return savedQueries;
}

/** Asks the API for one saved query. */
export function fetchSavedQuery(id: string): Promise<SavedQuery> {
  return callApi("GET", `/api/saved-queries/${id}`, savedQuery);
}

/** Saves a query. */
export function createSavedQuery(input: CreateSavedQueryRequest): Promise<SavedQuery> {
  return callApi("POST", "/api/saved-queries", savedQuery, input);
}

/** Changes a saved query's name, description, SQL, connections or who sees it. */
export function updateSavedQuery(
  id: string,
  changes: UpdateSavedQueryRequest,
): Promise<SavedQuery> {
  return callApi("PATCH", `/api/saved-queries/${id}`, savedQuery, changes);
}

/** Deletes a saved query. */
export async function deleteSavedQuery(id: string): Promise<void> {
  await sendApi("DELETE", `/api/saved-queries/${id}`);
}

/** The explorer's address with a saved query open, on its first connection if it has one. */
export function explorePathOf(query: SavedQuery): string {
  const first = query.connections[0];
  const params = new URLSearchParams(first ? { connection: first.name } : {});
  params.set("query", query.id);
  return `/explore?${params}`;
}
