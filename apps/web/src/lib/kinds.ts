/**
 * What kind of value a column holds, by the type Postgres's `format_type` names it with, which
 * decides what makes sense to do with it, like filtering or grouping on it.
 */
export type ColumnKind =
  | "boolean"
  | "number"
  | "text"
  | "date"
  | "timestamp"
  | "jsonb"
  | "json"
  | "array"
  | "other";

/** Answers the {@link ColumnKind} of a column of a type, as Postgres's `format_type` names it. */
export function columnKind(type: string): ColumnKind {
  if (type.endsWith("]")) return "array";
  if (type === "boolean") return "boolean";
  if (/^(smallint|integer|bigint|real|double precision|numeric|decimal|money|oid)\b/.test(type)) {
    return "number";
  }
  if (type === '"char"' || /^(text|character|name|citext)\b/.test(type)) return "text";
  if (type === "date") return "date";
  if (type.startsWith("timestamp")) return "timestamp";
  if (type === "jsonb") return "jsonb";
  if (type === "json") return "json";
  return "other";
}
