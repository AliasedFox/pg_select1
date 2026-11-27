import { expect, test } from "bun:test";

import {
  chartPoints,
  defaultAxes,
  MAX_CHART_ROWS,
  MAX_PIE_SLICES,
  parseNumber,
  pieSlices,
} from "./chart";

const column = (name: string, type: string) => ({ name, type });

test("starts with the first column along the bottom and the second up the side", () => {
  expect(defaultAxes([column("status", "text"), column("count", "bigint")])).toEqual({
    x: 0,
    y: 1,
  });
});

test("starts with the first column of numbers after the first when the second isn't one", () => {
  const columns = [column("day", "date"), column("name", "text"), column("total", "numeric(10,2)")];
  expect(defaultAxes(columns)).toEqual({ x: 0, y: 2 });
});

test("has nothing up the side when no column but the first holds numbers", () => {
  expect(defaultAxes([column("id", "bigint"), column("email", "text")])).toEqual({
    x: 0,
    y: undefined,
  });
  expect(defaultAxes([column("count", "bigint")])).toEqual({ x: 0, y: undefined });
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

test("makes a bar of each of the first rows, with NULL named along the bottom", () => {
  const rows = [
    ["paid", "3"],
    [null, "1"],
    ["refunded", null],
  ];
  expect(chartPoints(rows, 0, 1, "bigint")).toEqual([
    { x: "paid", y: 3 },
    { x: "NULL", y: 1 },
    { x: "refunded", y: null },
  ]);
  const many = Array.from({ length: MAX_CHART_ROWS + 10 }, (_, i) => [String(i), String(i)]);
  expect(chartPoints(many, 0, 1, "integer")).toHaveLength(MAX_CHART_ROWS);
});

test("slices a pie largest first, leaving out what isn't more than 0", () => {
  const points = [
    { x: "paid", y: 3 },
    { x: "NULL", y: null },
    { x: "refunded", y: 0 },
    { x: "credit", y: -2 },
    { x: "pending", y: 5 },
  ];
  expect(pieSlices(points)).toEqual([
    { x: "pending", y: 5 },
    { x: "paid", y: 3 },
  ]);
});

test("adds up the smallest slices past the most a pie has into Other", () => {
  const points = Array.from({ length: MAX_PIE_SLICES + 2 }, (_, i) => ({ x: `s${i}`, y: i + 1 }));
  const slices = pieSlices(points);
  expect(slices).toHaveLength(MAX_PIE_SLICES);
  expect(slices[0]).toEqual({ x: `s${MAX_PIE_SLICES + 1}`, y: MAX_PIE_SLICES + 2 });
  // The three smallest, 1 + 2 + 3.
  expect(slices.at(-1)).toEqual({ x: "Other", y: 6 });
});
