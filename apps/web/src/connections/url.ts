import type { SslMode } from "@pg_select1/shared";

/** What a connection URL says about a connection, as a form's fields. */
export interface UrlFields {
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  sslMode?: SslMode;
}

// libpq's modes, as the closest of pg_select1's. `allow` and `prefer` fall back to no SSL, which
// pg_select1 doesn't do, so they leave the choice to whoever fills the form.
const sslModes: Record<string, SslMode> = {
  disable: "disable",
  require: "require",
  "verify-ca": "verify-full",
  "verify-full": "verify-full",
};

/**
 * Reads a `postgres://` or `postgresql://` URL into a form's fields, decoding the user and
 * password, or answers `null` when it isn't one. Fields the URL doesn't have are left out.
 */
export function parseConnectionUrl(text: string): UrlFields | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;

  const fields: UrlFields = {};
  // An IPv6 address keeps its brackets in `hostname`.
  const host = decodeURIComponent(url.hostname).replace(/^\[(.*)\]$/, "$1");
  if (host) fields.host = host;
  if (url.port) fields.port = url.port;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (database) fields.database = database;
  if (url.username) fields.username = decodeURIComponent(url.username);
  if (url.password) fields.password = decodeURIComponent(url.password);
  const sslMode = sslModes[url.searchParams.get("sslmode") ?? ""];
  if (sslMode) fields.sslMode = sslMode;
  return fields;
}

/**
 * Suggests a connection name from a database's: lowercase, with anything but letters and digits
 * as `_`, so it follows the rules a name has to (`connectionName` in `@pg_select1/shared`).
 */
export function suggestName(database: string): string {
  return database
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/^pg_/, "")
    .replace(/_+$/, "")
    .slice(0, 40)
    .replace(/_+$/, "");
}
