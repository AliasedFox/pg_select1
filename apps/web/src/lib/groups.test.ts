import { describe, expect, test } from "bun:test";

import { columnGroups } from "./groups";

// The groups on a column of a type, by name, as one list of their clauses.
const groups = (type: string) =>
  Object.fromEntries(
    columnGroups("col", type)
      .flat()
      .map((group) => [group.name, group.clause]),
  );

// The query that a way of grouping a column of a type copies, by its name.
const query = (type: string, name: string, sql: string) =>
  columnGroups("col", type, sql)
    .flat()
    .find((group) => group.name === name)?.sql;

describe("columnGroups", () => {
  test("groups by the value itself on any type Postgres compares", () => {
    for (const type of ["text", "integer", "boolean", "uuid", "jsonb", "text[]", "order_status"]) {
      expect(groups(type)["by value"]).toBe(`group by "col"`);
    }
  });

  test("groups text ignoring case", () => {
    expect(groups("character varying(80)")["ignoring case"]).toBe(`group by lower("col")`);
  });

  test("groups numbers in buckets", () => {
    expect(groups("numeric(10,2)")["in buckets"]).toBe(`group by width_bucket("col", 0, 100, 10)`);
  });

  test("groups timestamps by hour up to year, and dates by week up to year, as dates", () => {
    const at = groups("timestamp with time zone");
    expect(at["by hour"]).toBe(`group by date_trunc('hour', "col")`);
    expect(at["by month"]).toBe(`group by date_trunc('month', "col")`);
    expect(groups("date")["by week"]).toBe(`group by date_trunc('week', "col")::date`);
    expect(groups("date")["by hour"]).toBeUndefined();
  });

  test("groups json only by a key, which has no equality of its own", () => {
    expect(groups("json")).toEqual({ "by key": `group by "col" ->> 'key'` });
    expect(groups("jsonb")["by key"]).toBe(`group by "col" ->> 'key'`);
  });

  test("groups arrays by their length", () => {
    expect(groups("integer[]")["by length"]).toBe(`group by cardinality("col")`);
  });

  test("counts the rows of each group of a plain select, most common first", () => {
    expect(query("integer", "by value", 'select * from "public"."t";\n')).toBe(
      [`select "col", count(*)`, `from "public"."t"`, "group by 1", "order by 2 desc"].join("\n"),
    );
    expect(query("integer", "by value", "SELECT *\nFROM t\nWHERE x in (1, 2)")).toBe(
      [`select "col", count(*)`, "from t\nWHERE x in (1, 2)", "group by 1", "order by 2 desc"].join(
        "\n",
      ),
    );
  });

  test("wraps any other query, so its limit, order or groups still count", () => {
    for (const sql of [
      "select * from t limit 10",
      "select * from t order by id",
      "select a, count(*) from t group by a",
      "select id from t",
      "with x as (select 1) select * from x",
      "select * from t union select * from u",
      // On lines of its own, so the comment doesn't hide the parenthesis.
      "select * from t -- the lot",
    ]) {
      expect(query("integer", "by value", sql)).toBe(
        [
          `select "col", count(*)`,
          "from (",
          sql,
          ") as result",
          "group by 1",
          "order by 2 desc",
        ].join("\n"),
      );
    }
  });

  test("names a group by its column, and puts groups of time in order", () => {
    expect(query("date", "by month", "select * from t")).toBe(
      [
        `select date_trunc('month', "col")::date as "col", count(*)`,
        "from t",
        "group by 1",
        "order by 1",
      ].join("\n"),
    );
  });

  test("is just the group by without a query to wrap", () => {
    expect(query("uuid", "by value", "  ")).toBe(`group by "col"`);
  });

  test("quotes the column", () => {
    expect(columnGroups('say "hi"', "uuid")[0]?.[0]?.clause).toBe(`group by "say ""hi"""`);
  });
});
