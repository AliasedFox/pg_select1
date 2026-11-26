import { columnKind } from "@/lib/kinds";
import { sqlIdentifier } from "@/lib/sql";

/** A way to group rows by one column: what it groups by in a few words, and the query to run. */
export interface ColumnGroup {
  name: string;
  /** The `group by` it comes to, short enough to show. */
  clause: string;
  /** A query that counts the rows of each group. */
  sql: string;
}

// What follows `select * from` in a query that's no more than that, a `where` and joins: one a
// `group by` can go at the end of as it is. A word like `limit` anywhere, even in a string or a
// name, leaves it to be wrapped, which works either way.
function plainFrom(query: string): string | undefined {
  const from = /^select\s+\*\s+from\s+([\s\S]+)$/i.exec(query)?.[1];
  if (
    !from ||
    /\b(group|having|order|limit|offset|fetch|union|intersect|except|window|for)\b|--|\/\*/i.test(
      from,
    )
  ) {
    return undefined;
  }
  return from;
}

/**
 * Answers the ways to group rows by a column of a type, as Postgres's `format_type` names it,
 * in groups: by the value itself, where Postgres can compare it, then by what fits the type, like
 * the day of a timestamp or a key of json. Values in them are stand-ins to replace, like `'key'`.
 * Each one's `sql` counts the rows of each group of `sql`, the query in the editor; a `group by`
 * alone wouldn't work next to its `select *`. A plain `select * from`, with a `where` or a join
 * at most, has its `*` swapped for the group and its count, and any other query is wrapped, so it
 * works whatever that query does. Groups of time come in order, others most common first.
 * Without a query, `sql` is just the `group by`.
 */
export function columnGroups(column: string, type: string, sql = ""): ColumnGroup[][] {
  const c = sqlIdentifier(column);
  const query = sql.trim().replace(/;\s*$/, "");
  const from = plainFrom(query);
  const groupBy = (name: string, expression: string, ordered = false): ColumnGroup => {
    const clause = `group by ${expression}`;
    if (!query) return { name, clause, sql: clause };
    // Named for the column, as the grid shows it.
    const selected = expression === c ? c : `${expression} as ${c}`;
    return {
      name,
      clause,
      sql: [
        `select ${selected}, count(*)`,
        // Its own lines, so a comment on the query's last line doesn't hide the parenthesis.
        ...(from === undefined ? ["from (", query, ") as result"] : [`from ${from}`]),
        "group by 1",
        ordered ? "order by 1" : "order by 2 desc",
      ].join("\n"),
    };
  };
  const byValue = groupBy("by value", c);
  const truncated = (units: string[], cast = "") =>
    units.map((unit) => groupBy(`by ${unit}`, `date_trunc('${unit}', ${c})${cast}`, true));

  switch (columnKind(type)) {
    case "text":
      return [[byValue, groupBy("ignoring case", `lower(${c})`)]];
    case "number":
      return [[byValue], [groupBy("in buckets", `width_bucket(${c}, 0, 100, 10)`, true)]];
    case "timestamp":
      return [[byValue], truncated(["hour", "day", "week", "month", "year"])];
    case "date":
      // Cast back, since `date_trunc` answers a timestamp.
      return [[byValue], truncated(["week", "month", "year"], "::date")];
    case "jsonb":
      return [[byValue, groupBy("by key", `${c} ->> 'key'`)]];
    case "json":
      // json has no equality, so Postgres can only group by what's in it.
      return [[groupBy("by key", `${c} ->> 'key'`)]];
    case "array":
      return [[byValue, groupBy("by length", `cardinality(${c})`)]];
    default:
      return [[byValue]];
  }
}
