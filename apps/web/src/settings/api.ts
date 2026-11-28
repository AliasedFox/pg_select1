import { type Settings, settings, type UpdateSettingsRequest } from "@pg_select1/shared";

import { callApi } from "@/lib/api";

/** Asks the API for pg_select1's settings. Admins only. */
export function fetchSettings(): Promise<Settings> {
  return callApi("GET", "/api/settings", settings);
}

/** Changes pg_select1's settings, answering them all as they are now. Admins only. */
export function updateSettings(changes: UpdateSettingsRequest): Promise<Settings> {
  return callApi("PATCH", "/api/settings", settings, changes);
}
