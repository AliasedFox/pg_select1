import type { ResultColumn } from "@pg_select1/shared";

import { columnKind } from "@/lib/kinds";

/** The most rows a chart draws, the first of a result's: more bars than this can't be told apart. */
export const MAX_CHART_ROWS = 500;

/** One bar: what's along the bottom, as Postgres prints it, and how high it is, if it's a number. */
export interface ChartPoint {
  x: string;
  y: number | null;
}

/** Whether a column holds numbers, so it can be along a chart's side. */
export function isNumberColumn(column: ResultColumn): boolean {
  return columnKind(column.type) === "number";
}

/**
 * Picks the columns a chart of a result starts with, by their positions: the first along the
 * bottom, and the second up the side, or the first column of numbers after the first when the
 * second isn't one. `y` is `undefined` when no column but the first holds numbers.
 */
export function defaultAxes(columns: ResultColumn[]): { x: number; y: number | undefined } {
  const second = columns[1];
  if (second && isNumberColumn(second)) return { x: 0, y: 1 };
  const y = columns.findIndex((column, index) => index > 0 && isNumberColumn(column));
  return { x: 0, y: y === -1 ? undefined : y };
}

/**
 * Reads a number as Postgres prints it in a column of `type`, or `null` for `NULL`, `NaN` or
 * infinity, which have no height. `money` comes with its currency's sign and separators, which
 * are dropped.
 */
export function parseNumber(value: string | null, type: string): number | null {
  if (value === null) return null;
  const text = type === "money" ? value.replace(/[^\d.-]/g, "") : value;
  const number = Number(text);
  return text.trim() !== "" && Number.isFinite(number) ? number : null;
}

/**
 * Answers the bars of a chart of `rows`, one for each of the first {@link MAX_CHART_ROWS}, with
 * column `x` along the bottom and column `y`, of `type`, up the side. A `NULL` along the bottom
 * is named `NULL`, as the grid shows it.
 */
export function chartPoints(
  rows: (string | null)[][],
  x: number,
  y: number,
  type: string,
): ChartPoint[] {
  return rows.slice(0, MAX_CHART_ROWS).map((row) => ({
    x: row[x] ?? "NULL",
    y: parseNumber(row[y] ?? null, type),
  }));
}
