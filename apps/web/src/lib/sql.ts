/**
 * Quotes a name for SQL, so any name works as it is: capitals, spaces, quotes or a keyword like
 * `user`.
 */
export function sqlIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
