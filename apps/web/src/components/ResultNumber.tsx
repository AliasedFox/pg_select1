import type { TableRows } from "@pg_select1/shared";

import { columnKind } from "@/lib/kinds";

// The locale's decimal separator, for a number whose digits are grouped by hand.
const decimal =
  new Intl.NumberFormat().formatToParts(0.5).find((part) => part.type === "decimal")?.value ?? ".";

// A value as Postgres prints it, with its whole part's digits grouped when it's a plain number
// of a column of `type`. Grouped by hand, through BigInt, so a bigint or numeric past what a
// JavaScript number holds keeps every digit; anything else, like money, is left as it is.
function formatValue(value: string, type: string): string {
  const match = /^(-?\d+)(?:\.(\d+))?$/.exec(value);
  if (columnKind(type) !== "number" || !match) return value;
  const [, whole = "", fraction] = match;
  const grouped = BigInt(whole).toLocaleString();
  // BigInt drops the sign of a whole part of -0, as in -0.5, so it's put back.
  const signed = whole.startsWith("-") && !grouped.startsWith("-") ? `-${grouped}` : grouped;
  return fraction === undefined ? signed : `${signed}${decimal}${fraction}`;
}

/**
 * Shows a result as one number: the value in its first row's first column, large, under that
 * column's name. It's for a query that answers one value, like a `count(*)` or a `sum()`, and
 * doesn't add anything up itself, so the rest of the rows and columns are left out. Says so when
 * there's no row.
 */
export function ResultNumber({ data }: { data: TableRows }) {
  const column = data.columns[0];
  const row = data.rows[0];
  if (!column || !row) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        There's no row to show a number of.
      </div>
    );
  }
  const value = row[0] ?? null;
  return (
    <figure aria-label="Result number" className="grid gap-1 rounded-lg border p-6">
      <figcaption className="truncate font-mono text-xs text-muted-foreground">
        {column.name}
      </figcaption>
      <p
        className={
          value === null
            ? "text-4xl font-semibold text-muted-foreground"
            : "truncate font-mono text-4xl font-semibold tabular-nums"
        }
        title={value ?? undefined}
      >
        {value === null ? "NULL" : formatValue(value, column.type)}
      </p>
    </figure>
  );
}
