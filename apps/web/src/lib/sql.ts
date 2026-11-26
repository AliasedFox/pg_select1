import type { TargetTable } from "@pg_select1/shared";

/**
 * Quotes a name for SQL, so any name works as it is: capitals, spaces, quotes or a keyword like
 * `user`.
 */
export function sqlIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Answers a table's name with its schema, for SQL, which works whatever the `search_path`. */
export function sqlTableName({ schema, name }: Pick<TargetTable, "schema" | "name">): string {
  return `${sqlIdentifier(schema)}.${sqlIdentifier(name)}`;
}
