import { expect, test } from "bun:test";

import {
  chartColumns,
  chartData,
  MAX_CHART_POINTS,
  MAX_PIE_SLICES,
  MAX_SERIES,
  parseNumber,
  pieSlices,
} from "./chart";

const column = (name: string, type: string) => ({ name, type });

test("charts the first column along the bottom and each column of numbers after it", () => {
  expect(chartColumns([column("status", "text"), column("count", "bigint")])).toEqual({
    values: [1],
    split: undefined,
  });
  const columns = [
    column("day", "date"),
    column("signups", "bigint"),
    column("churned", "integer"),
  ];
  expect(chartColumns(columns)).toEqual({ values: [1, 2], split: undefined });
  // The first column is along the bottom even when it holds numbers.
  expect(chartColumns([column("hour", "integer"), column("orders", "bigint")])).toEqual({
    values: [1],
    split: undefined,
  });
});

test("splits the first column of numbers into series by a column of names after the first", () => {
  const columns = [
    column("month", "date"),
    column("method", "text"),
    column("total", "numeric"),
    column("count", "bigint"),
  ];
  expect(chartColumns(columns)).toEqual({ values: [2], split: 1 });
  // Wherever the names are, after the first column.
  expect(chartColumns([columns[0]!, columns[2]!, columns[1]!])).toEqual({ values: [1], split: 2 });
});

test("has nothing to chart without a column of numbers after the first", () => {
  expect(chartColumns([column("count", "bigint")])).toBeUndefined();
  expect(chartColumns([column("id", "bigint"), column("email", "text")])).toBeUndefined();
  expect(chartColumns([])).toBeUndefined();
});

test("reads numbers as Postgres prints them", () => {
  expect(parseNumber("42", "bigint")).toBe(42);
  expect(parseNumber("-3.5", "numeric")).toBe(-3.5);
  expect(parseNumber("1.5e+20", "double precision")).toBe(1.5e20);
  expect(parseNumber("$1,234.50", "money")).toBe(1234.5);
  expect(parseNumber("-$7.00", "money")).toBe(-7);
  for (const value of [null, "NaN", "Infinity", "-Infinity", ""]) {
    expect(parseNumber(value, "double precision")).toBeNull();
  }
});

test("makes a point of each of the first rows, a series for each column, with NULL named", () => {
  const columns = [column("status", "text"), column("orders", "bigint"), column("total", "money")];
  const rows = [
    ["paid", "3", "$30.00"],
    [null, "1", "$5.00"],
    ["refunded", null, "$0.00"],
  ];
  expect(chartData({ columns, rows }, { values: [1, 2], split: undefined })).toEqual({
    points: [
      { x: "paid", s0: 3, s1: 30 },
      { x: "NULL", s0: 1, s1: 5 },
      { x: "refunded", s0: null, s1: 0 },
    ],
    series: [
      { key: "s0", name: "orders" },
      { key: "s1", name: "total" },
    ],
    rows: 3,
    stacked: false,
  });
  const many = Array.from({ length: MAX_CHART_POINTS + 10 }, (_, i) => [String(i), String(i)]);
  const drawn = chartData(
    { columns: [column("n", "integer"), column("m", "integer")], rows: many },
    { values: [1], split: undefined },
  );
  expect(drawn.points).toHaveLength(MAX_CHART_POINTS);
  expect(drawn.rows).toBe(MAX_CHART_POINTS);
});

test("stacks a series for each name, adding up its rows, 0 where it has none", () => {
  const columns = [column("month", "date"), column("method", "text"), column("total", "numeric")];
  const rows = [
    ["2026-09-01", "card", "100"],
    ["2026-09-01", "transfer", "40"],
    ["2026-09-01", "card", "20"],
    ["2026-10-01", "transfer", "300"],
    ["2026-10-01", null, "5"],
    ["2026-10-01", "check", null],
  ];
  expect(chartData({ columns, rows }, { values: [2], split: 1 })).toEqual({
    points: [
      { x: "2026-09-01", s0: 40, s1: 120, s2: 0, s3: 0 },
      { x: "2026-10-01", s0: 300, s1: 0, s2: 5, s3: 0 },
    ],
    // The largest in all first.
    series: [
      { key: "s0", name: "transfer" },
      { key: "s1", name: "card" },
      { key: "s2", name: "NULL" },
      { key: "s3", name: "check" },
    ],
    rows: 6,
    stacked: true,
  });
});

test("adds up the smallest names past the most series into Other", () => {
  const columns = [column("day", "date"), column("source", "text"), column("visits", "bigint")];
  const names = Array.from({ length: MAX_SERIES + 2 }, (_, i) => `n${i}`);
  // n0 has the most visits, and each after it one fewer.
  const rows = names.map((name, i) => ["2026-11-01", name, String(100 - i)]);
  const { points, series } = chartData({ columns, rows }, { values: [2], split: 1 });
  expect(series).toHaveLength(MAX_SERIES);
  expect(series.at(-1)).toEqual({ key: `s${MAX_SERIES - 1}`, name: "Other" });
  const other = rows.slice(MAX_SERIES - 1).reduce((sum, row) => sum + Number(row[2]), 0);
  expect(points[0]?.[`s${MAX_SERIES - 1}`]).toBe(other);
});

test("charts the rows of the first values along the bottom when split into series", () => {
  const columns = [column("n", "integer"), column("side", "text"), column("m", "integer")];
  const rows = Array.from({ length: MAX_CHART_POINTS + 5 }, (_, i) => [
    [String(i), "a", "1"],
    [String(i), "b", "2"],
  ]).flat();
  const drawn = chartData({ columns, rows }, { values: [2], split: 1 });
  expect(drawn.points).toHaveLength(MAX_CHART_POINTS);
  expect(drawn.rows).toBe(MAX_CHART_POINTS * 2);
});

test("slices a pie by the first column, adding up its rows, largest first, leaving out what isn't more than 0", () => {
  const columns = [column("status", "text"), column("orders", "bigint")];
  const rows = [
    ["paid", "3"],
    ["NULL", null],
    ["refunded", "0"],
    ["credit", "-2"],
    ["pending", "5"],
    ["paid", "4"],
  ];
  expect(pieSlices({ columns, rows }, { values: [1], split: undefined })).toEqual([
    { x: "paid", y: 7 },
    { x: "pending", y: 5 },
  ]);
});

test("adds up the smallest slices past the most a pie has into Other", () => {
  const columns = [column("status", "text"), column("orders", "bigint")];
  const rows = Array.from({ length: MAX_PIE_SLICES + 2 }, (_, i) => [`s${i}`, String(i + 1)]);
  const slices = pieSlices({ columns, rows }, { values: [1], split: undefined });
  expect(slices).toHaveLength(MAX_PIE_SLICES);
  expect(slices[0]).toEqual({ x: `s${MAX_PIE_SLICES + 1}`, y: MAX_PIE_SLICES + 2 });
  // The three smallest, 1 + 2 + 3.
  expect(slices.at(-1)).toEqual({ x: "Other", y: 6 });
});
