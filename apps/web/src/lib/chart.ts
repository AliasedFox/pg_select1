import { type ChartKind, chartKind, type ResultColumn, type TableRows } from "@pg_select1/shared";

import { columnKind } from "@/lib/kinds";

/** The most values a chart has along the bottom, its result's first: more bars than this can't be told apart. */
export const MAX_CHART_POINTS = 500;

/**
 * The most series a column of names splits a chart into, the last of them the rest of the names
 * added up as Other, since the theme's greys can't tell more apart.
 */
export const MAX_SERIES = 6;

/** The most slices a pie has, the last of them the rest of its rows added up as Other. */
export const MAX_PIE_SLICES = 8;

/** The kinds of chart a result can be drawn as, in the order they're offered. */
export const CHART_KINDS: readonly ChartKind[] = chartKind.options;

/** What a chart is drawn as before another kind is picked. */
export const DEFAULT_CHART_KIND: ChartKind = "bar";

/**
 * The columns a chart of a result draws, by their positions, read from their order: the first
 * is always along the bottom, and `values` are the columns of numbers after it, a series each
 * (`select day, signups, churned`). When a column that isn't of numbers comes after the first,
 * it's the `split`: its names split the rows into series, each of the first column of numbers
 * after the first (`select month, method, sum(amount) … group by 1, 2`), which is then the only
 * one of `values`.
 */
export interface ChartColumns {
  values: [number, ...number[]];
  split: number | undefined;
}

/** One series of a chart: its key in each {@link ChartPoint}, and the name it's shown with. */
export interface ChartSeries {
  key: `s${number}`;
  name: string;
}

/**
 * One value along a chart's bottom, as Postgres prints it, with each series' number there,
 * `null` when it has none.
 */
export interface ChartPoint {
  x: string;
  [key: `s${number}`]: number | null;
}

/**
 * What a chart draws: its points along the bottom and its series up the side, how many of the
 * result's rows they're of, and whether the series stack, as the parts of one whole that a
 * column of names splits a number into do.
 */
export interface ChartData {
  points: ChartPoint[];
  series: ChartSeries[];
  rows: number;
  stacked: boolean;
}

/** One slice of a pie: what it's of, as Postgres prints it, and its size, more than 0. */
export interface PieSlice {
  x: string;
  y: number;
}

/** Whether a column holds numbers, so it can be up a chart's side. */
export function isNumberColumn(column: ResultColumn): boolean {
  return columnKind(column.type) === "number";
}

/**
 * Reads the {@link ChartColumns} of a result from the order of its columns, or `undefined` when
 * no column after the first holds numbers, so there's nothing to chart.
 */
export function chartColumns(columns: ResultColumn[]): ChartColumns | undefined {
  const [first, ...rest] = columns.flatMap((column, index) =>
    index > 0 && isNumberColumn(column) ? [index] : [],
  );
  if (first === undefined) return undefined;
  const split = columns.findIndex((column, index) => index > 0 && !isNumberColumn(column));
  return split === -1 ? { values: [first, ...rest], split: undefined } : { values: [first], split };
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
 * Answers what a chart of `data` draws with `chart`'s columns, over the first
 * {@link MAX_CHART_POINTS} values along the bottom. A `NULL` along the bottom or in the split
 * is named `NULL`, as the grid shows it.
 *
 * Without a split, each row is a point, with a series for each column of numbers. With one, the
 * rows with the same value along the bottom are one point, and each series is the sum of its
 * rows there, 0 when it has none, since they stack. Its series are the split's names, the
 * largest in all first, and past {@link MAX_SERIES} the smallest are added up as Other.
 */
export function chartData(
  data: Pick<TableRows, "columns" | "rows">,
  chart: ChartColumns,
): ChartData {
  const { columns, rows } = data;
  const typeOf = (index: number) => columns[index]?.type ?? "";
  if (chart.split === undefined) {
    const used = rows.slice(0, MAX_CHART_POINTS);
    const series = chart.values.map((index, i) => ({
      key: `s${i}` as const,
      name: columns[index]?.name ?? "",
    }));
    const points = used.map((row) => {
      const point: ChartPoint = { x: row[0] ?? "NULL" };
      chart.values.forEach((index, i) => {
        point[`s${i}`] = parseNumber(row[index] ?? null, typeOf(index));
      });
      return point;
    });
    return { points, series, rows: used.length, stacked: false };
  }

  const { split } = chart;
  const [value] = chart.values;
  // Each value along the bottom, in the order the rows have them, with what each name adds up
  // to there, and what each name adds up to in all, to rank them.
  const sums = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  let used = 0;
  for (const row of rows) {
    const x = row[0] ?? "NULL";
    let at = sums.get(x);
    if (!at) {
      if (sums.size === MAX_CHART_POINTS) break;
      at = new Map();
      sums.set(x, at);
    }
    used += 1;
    const name = row[split] ?? "NULL";
    const y = parseNumber(row[value] ?? null, typeOf(value)) ?? 0;
    at.set(name, (at.get(name) ?? 0) + y);
    totals.set(name, (totals.get(name) ?? 0) + y);
  }

  const ranked = [...totals.keys()].toSorted((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  const names =
    ranked.length <= MAX_SERIES ? ranked : [...ranked.slice(0, MAX_SERIES - 1), "Other"];
  const series = names.map((name, i) => ({ key: `s${i}` as const, name }));
  // A name past the last series is in Other, the last.
  const rank = new Map(ranked.map((name, i) => [name, Math.min(i, series.length - 1)]));
  const points = [...sums].map(([x, at]) => {
    const point: ChartPoint = { x };
    for (const { key } of series) point[key] = 0;
    for (const [name, y] of at) {
      const key = `s${rank.get(name) ?? 0}` as const;
      point[key] = (point[key] ?? 0) + y;
    }
    return point;
  });
  return { points, series, rows: used, stacked: true };
}

/**
 * Answers the slices of a pie of `data`, one for each value of its first column, sized by the
 * sum of `chart`'s first column of numbers over its rows, the largest first. A pie can't show
 * what isn't more than 0, so those are left out, and past {@link MAX_PIE_SLICES} the smallest
 * are added up into one last slice, Other, since thin slices can't be told apart.
 */
export function pieSlices(
  data: Pick<TableRows, "columns" | "rows">,
  chart: ChartColumns,
): PieSlice[] {
  const [value] = chart.values;
  const type = data.columns[value]?.type ?? "";
  const sums = new Map<string, number>();
  for (const row of data.rows) {
    const y = parseNumber(row[value] ?? null, type);
    const x = row[0] ?? "NULL";
    if (y !== null) sums.set(x, (sums.get(x) ?? 0) + y);
  }
  const slices = [...sums]
    .map(([x, y]) => ({ x, y }))
    .filter((slice) => slice.y > 0)
    .toSorted((a, b) => b.y - a.y);
  if (slices.length <= MAX_PIE_SLICES) return slices;
  const rest = slices.slice(MAX_PIE_SLICES - 1).reduce((sum, slice) => sum + slice.y, 0);
  return [...slices.slice(0, MAX_PIE_SLICES - 1), { x: "Other", y: rest }];
}
