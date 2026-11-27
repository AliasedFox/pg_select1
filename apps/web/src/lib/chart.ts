import {
  type ChartKind,
  chartKind,
  type QueryDisplay,
  type ResultColumn,
} from "@pg_select1/shared";

import { columnKind } from "@/lib/kinds";

/** The most rows a chart draws, the first of a result's: more bars than this can't be told apart. */
export const MAX_CHART_ROWS = 500;

/** The most slices a pie has, the last of them the rest of its rows added up as Other. */
export const MAX_PIE_SLICES = 8;

/** The kinds of chart a result can be drawn as, in the order they're offered. */
export const CHART_KINDS: readonly ChartKind[] = chartKind.options;

/**
 * How a chart draws a result: its kind, and the columns along the bottom and up the side, by
 * name, or `null` for the ones {@link chartAxes} picks. It's what a saved query shown as a chart
 * keeps.
 */
export type ChartSettings = Omit<Extract<QueryDisplay, { type: "chart" }>, "type">;

/** What a chart starts as, before anything's picked: bars, on the columns it picks. */
export const DEFAULT_CHART: ChartSettings = { kind: "bar", x: null, y: null };

/** One bar: what's along the bottom, as Postgres prints it, and how high it is, if it's a number. */
export interface ChartPoint {
  x: string;
  y: number | null;
}

/** One slice of a pie: what it's of, as Postgres prints it, and its size, more than 0. */
export interface PieSlice {
  x: string;
  y: number;
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
 * Finds the columns a chart of a result has, by their positions, from the columns `settings`
 * names. A column the result doesn't have, or `null`, is the one {@link defaultAxes} picks, and
 * so is a column up the side that isn't one of numbers or is the one along the bottom, else the
 * first other column of numbers. With duplicate names, it's the first column of the name.
 */
export function chartAxes(
  columns: ResultColumn[],
  settings: Pick<ChartSettings, "x" | "y">,
): { x: number; y: number | undefined } {
  const fallback = defaultAxes(columns);
  const named = (name: string | null) =>
    name === null ? -1 : columns.findIndex((column) => column.name === name);
  const picked = named(settings.x);
  const x = picked === -1 ? fallback.x : picked;
  const y = named(settings.y);
  const column = columns[y];
  if (y !== x && column && isNumberColumn(column)) return { x, y };
  if (fallback.y !== undefined && fallback.y !== x) return { x, y: fallback.y };
  const other = columns.findIndex((c, index) => index !== x && isNumberColumn(c));
  return { x, y: other === -1 ? undefined : other };
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

/**
 * Answers the slices of a pie of `points`, the largest first. A pie can't show what isn't more
 * than 0, so those points are left out, and past {@link MAX_PIE_SLICES} the smallest are added up
 * into one last slice, Other, since thin slices can't be told apart.
 */
export function pieSlices(points: ChartPoint[]): PieSlice[] {
  const slices = points
    .filter((point): point is PieSlice => point.y !== null && point.y > 0)
    .toSorted((a, b) => b.y - a.y);
  if (slices.length <= MAX_PIE_SLICES) return slices;
  const rest = slices.slice(MAX_PIE_SLICES - 1).reduce((sum, slice) => sum + slice.y, 0);
  return [...slices.slice(0, MAX_PIE_SLICES - 1), { x: "Other", y: rest }];
}
