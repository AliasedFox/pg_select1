import type { HealthResponse } from "@pg_select1/shared";
import { http, HttpResponse } from "msw";

/** A `/health` answer with everything up. */
export const healthyResponse: HealthResponse = {
  status: "ok",
  version: "0.0.0",
  database: { ok: true, latencyMs: 3 },
  time: "2026-01-01T12:00:00.000Z",
};

/** A `/health` answer with pg_select1's database down. */
export const unhealthyResponse: HealthResponse = {
  status: "error",
  version: "0.0.0",
  database: { ok: false, latencyMs: null },
  time: "2026-01-01T12:00:00.000Z",
};

/** The API as tests and stories see it by default: everything up. */
export const handlers = [http.get("/health", () => HttpResponse.json(healthyResponse))];
