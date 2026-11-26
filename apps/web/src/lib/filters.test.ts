import { describe, expect, test } from "bun:test";

import { columnFilters } from "./filters";

// The filters on a column of a type, by name, as one list.
const filters = (type: string, today?: Date) =>
  Object.fromEntries(
    columnFilters("col", type, "", today)
      .flat()
      .map((filter) => [filter.name, filter.sql]),
  );

describe("columnFilters", () => {
  test("offers text searches on text, whatever its length", () => {
    for (const type of ["text", "character varying(80)", "character(2)", '"char"', "citext"]) {
      expect(filters(type).contains).toBe(`where "col" ilike '%value%'`);
    }
    expect(filters("text")["starts with"]).toBe(`where "col" ilike 'value%'`);
    expect(filters("text")["is empty"]).toBe(`where "col" = ''`);
  });

  test("offers comparisons on numbers", () => {
    for (const type of ["integer", "bigint", "numeric(10,2)", "double precision"]) {
      expect(filters(type).between).toBe(`where "col" between 0 and 100`);
    }
    expect(filters("bigint").contains).toBeUndefined();
  });

  test("offers true and false on booleans, with no value to fill in", () => {
    expect(filters("boolean")).toEqual({
      "is true": `where "col"`,
      "is false": `where not "col"`,
      "isn't true": `where "col" is not true`,
      "is null": `where "col" is null`,
      "is not null": `where "col" is not null`,
    });
  });

  test("offers recent times on timestamps, and dates near today", () => {
    const today = new Date(2026, 10, 26);
    const at = filters("timestamp with time zone", today);
    expect(at["last 7 days"]).toBe(`where "col" >= now() - interval '7 days'`);
    expect(at.before).toBe(`where "col" < '2026-11-26'`);
    expect(at.between).toBe(`where "col" >= '2026-11-01' and "col" < '2026-12-01'`);
    expect(filters("date", today).between).toBe(
      `where "col" between '2026-11-01' and '2026-11-30'`,
    );
  });

  test("offers keys on json, and containment only on jsonb", () => {
    expect(filters("jsonb")["has key"]).toBe(`where "col" ? 'key'`);
    expect(filters("json")["key is"]).toBe(`where "col" ->> 'key' = 'value'`);
    expect(filters("json")["has key"]).toBeUndefined();
  });

  test("offers membership on arrays", () => {
    expect(filters("text[]").has).toBe(`where 'value' = any("col")`);
    expect(filters("integer[]")["is empty"]).toBe(`where cardinality("col") = 0`);
  });

  test("compares any other type with a quoted value", () => {
    expect(filters("uuid").is).toBe(`where "col" = 'value'`);
    expect(filters("order_status")["one of"]).toBe(`where "col" in ('a', 'b')`);
  });

  test("adds to a where the query already has, whatever its case", () => {
    const first = (sql: string) => columnFilters("col", "boolean", sql)[0]?.[0]?.sql;
    expect(first("select * from t")).toBe(`where "col"`);
    expect(first("select * from t\nWHERE id = 1")).toBe(`and "col"`);
    // A word that only has "where" in it isn't one.
    expect(first("select somewhere from t")).toBe(`where "col"`);
  });

  test("quotes the column", () => {
    expect(columnFilters('say "hi"', "text")[0]?.[0]?.sql).toBe(`where "say ""hi""" = 'value'`);
  });
});
