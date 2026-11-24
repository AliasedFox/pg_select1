import { expect, test } from "bun:test";

import { parseConnectionUrl, suggestName } from "./url";

test("reads every field from a connection URL, decoding the user and password", () => {
  expect(
    parseConnectionUrl(
      "postgresql://re%40der:p%2Fss%20w@db.example.com:6543/shop_eu?sslmode=require",
    ),
  ).toEqual({
    host: "db.example.com",
    port: "6543",
    database: "shop_eu",
    username: "re@der",
    password: "p/ss w",
    sslMode: "require",
  });
});

test("leaves out what a URL doesn't say", () => {
  expect(parseConnectionUrl("postgres://localhost")).toEqual({ host: "localhost" });
  expect(parseConnectionUrl("postgres://[::1]:5432/app?sslmode=prefer")).toEqual({
    host: "::1",
    port: "5432",
    database: "app",
  });
});

test("isn't fooled by anything but a postgres URL", () => {
  expect(parseConnectionUrl("db.example.com")).toBeNull();
  expect(parseConnectionUrl("mysql://db.example.com/shop")).toBeNull();
});

test("suggests a name a connection can have", () => {
  expect(suggestName("Shop-EU")).toBe("shop_eu");
  expect(suggestName("2024 orders")).toBe("orders");
  expect(suggestName("pg_stats")).toBe("stats");
});
