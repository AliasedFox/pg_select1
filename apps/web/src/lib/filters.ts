import { columnKind } from "@/lib/kinds";
import { sqlIdentifier } from "@/lib/sql";

/** A `where` clause on one column, or an `and` to add to one, with what it keeps in a few words. */
export interface ColumnFilter {
  name: string;
  sql: string;
}

// A day as SQL writes it, by the browser's calendar.
function isoDay(day: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `'${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}'`;
}

/**
 * Answers the `where` clauses that make sense on a column of a type, as Postgres's `format_type`
 * names it, in groups: comparisons that fit the type, like `ilike` on text or `between` on
 * numbers, then `is null` and `is not null`, which fit any. Values to compare with are stand-ins
 * to replace, `'value'` or `0`, except where one makes sense as it is, like the last 7 days, and
 * dates, which are `today`'s and its month's, so they're near what one would type. Each starts
 * with `where`, or with `and` when `sql`, the query it's for, already has a `where`: a plain
 * match on the word, so one in a subquery or a string counts too.
 */
export function columnFilters(
  column: string,
  type: string,
  sql = "",
  today = new Date(),
): ColumnFilter[][] {
  const c = sqlIdentifier(column);
  const keyword = /\bwhere\b/i.test(sql) ? "and" : "where";
  const day = isoDay(today);
  const monthStart = isoDay(new Date(today.getFullYear(), today.getMonth(), 1));
  const nextMonthStart = isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 1));
  const monthEnd = isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const where = (name: string, condition: string): ColumnFilter => ({
    name,
    sql: `${keyword} ${condition}`,
  });
  const nulls = [where("is null", `${c} is null`), where("is not null", `${c} is not null`)];

  switch (columnKind(type)) {
    case "boolean":
      return [
        [
          where("is true", c),
          where("is false", `not ${c}`),
          where("isn't true", `${c} is not true`),
        ],
        nulls,
      ];
    case "number":
      return [
        [
          where("equals", `${c} = 0`),
          where("doesn't equal", `${c} <> 0`),
          where("greater than", `${c} > 0`),
          where("less than", `${c} < 0`),
          where("between", `${c} between 0 and 100`),
          where("one of", `${c} in (1, 2, 3)`),
        ],
        nulls,
      ];
    case "text":
      return [
        [
          where("is", `${c} = 'value'`),
          where("isn't", `${c} <> 'value'`),
          where("one of", `${c} in ('a', 'b')`),
        ],
        // `ilike`, since one searching text seldom minds its case.
        [
          where("contains", `${c} ilike '%value%'`),
          where("doesn't contain", `${c} not ilike '%value%'`),
          where("starts with", `${c} ilike 'value%'`),
          where("ends with", `${c} ilike '%value'`),
          where("matches", `${c} ~* 'regex'`),
        ],
        [where("is empty", `${c} = ''`), ...nulls],
      ];
    case "timestamp":
      return [
        [
          where("last hour", `${c} >= now() - interval '1 hour'`),
          where("last 24 hours", `${c} >= now() - interval '1 day'`),
          where("last 7 days", `${c} >= now() - interval '7 days'`),
          where("today", `${c} >= current_date`),
        ],
        [
          where("before", `${c} < ${day}`),
          where("after", `${c} >= ${day}`),
          // A half-open range, so a month's last day counts whatever its time.
          where("between", `${c} >= ${monthStart} and ${c} < ${nextMonthStart}`),
        ],
        nulls,
      ];
    case "date":
      return [
        [
          where("today", `${c} = current_date`),
          where("last 7 days", `${c} >= current_date - 7`),
          where("last 30 days", `${c} >= current_date - 30`),
        ],
        [
          where("before", `${c} < ${day}`),
          where("after", `${c} > ${day}`),
          where("between", `${c} between ${monthStart} and ${monthEnd}`),
        ],
        nulls,
      ];
    case "jsonb":
      return [
        [
          where("key is", `${c} ->> 'key' = 'value'`),
          where("has key", `${c} ? 'key'`),
          where("contains", `${c} @> '{"key": "value"}'`),
        ],
        nulls,
      ];
    case "json":
      return [[where("key is", `${c} ->> 'key' = 'value'`)], nulls];
    case "array":
      return [
        [
          where("has", `'value' = any(${c})`),
          where("has all of", `${c} @> '{a,b}'`),
          where("has any of", `${c} && '{a,b}'`),
          where("is empty", `cardinality(${c}) = 0`),
        ],
        nulls,
      ];
    default:
      // uuid, enums, inet and the like: compared with a quoted value, which Postgres casts.
      return [
        [
          where("is", `${c} = 'value'`),
          where("isn't", `${c} <> 'value'`),
          where("one of", `${c} in ('a', 'b')`),
        ],
        nulls,
      ];
  }
}
