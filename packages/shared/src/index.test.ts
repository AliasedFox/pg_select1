import { expect, test } from "bun:test";

import { healthResponse } from "./index";

test("healthResponse accepts a database that's down, with no latency", () => {
  const parsed = healthResponse.safeParse({
    status: "error",
    version: "0.0.0",
    database: { ok: false, latencyMs: null },
    time: "2026-01-01T12:00:00.000Z",
  });

  expect(parsed.success).toBe(true);
});

test("healthResponse rejects a status it doesn't know", () => {
  const parsed = healthResponse.safeParse({
    status: "degraded",
    version: "0.0.0",
    database: { ok: true, latencyMs: 1 },
    time: "2026-01-01T12:00:00.000Z",
  });

  expect(parsed.success).toBe(false);
});
