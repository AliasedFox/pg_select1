import { type HealthResponse, healthResponse } from "@pg_select1/shared";

import { getJson } from "@/lib/api";

/** Asks the API whether pg_select1 and its database are up. */
export function fetchHealth(): Promise<HealthResponse> {
  return getJson("/health", healthResponse);
}
