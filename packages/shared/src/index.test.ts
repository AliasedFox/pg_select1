import { expect, test } from "bun:test";

import { connectionName, createConnectionRequest, healthResponse } from "./index";

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

test("connectionName accepts lowercase names with digits and single underscores", () => {
  for (const name of ["shop", "crm2", "billing_eu", "a".repeat(40)]) {
    expect(connectionName.safeParse(name).success).toBe(true);
  }
});

test("connectionName refuses names Postgres or pg_select1 can't use as a prefix", () => {
  for (const name of [
    "",
    "Shop",
    "2shop",
    "_shop",
    "shop-eu",
    "shop__eu",
    "pg_shop",
    "a".repeat(41),
  ]) {
    expect(connectionName.safeParse(name).success).toBe(false);
  }
});

test("a blank password in a new connection is no password", () => {
  const parsed = createConnectionRequest.parse({
    name: "shop",
    host: "localhost",
    port: 5432,
    database: "shop",
    username: "reader",
    sslMode: "disable",
    password: "",
  });

  expect(parsed.password).toBeUndefined();
  expect(parsed.visible).toBe(false);
});
