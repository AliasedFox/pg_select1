import { z } from "zod";

/** What `GET /health` answers: whether pg_select1 is up and can reach its own database. */
export const healthResponse = z.object({
  status: z.enum(["ok", "error"]),
  version: z.string(),
  database: z.object({
    ok: z.boolean(),
    latencyMs: z.number().nullable(),
  }),
  time: z.iso.datetime(),
});

/** The body of a `GET /health` response, as {@link healthResponse} parses it. */
export type HealthResponse = z.infer<typeof healthResponse>;

/** What an API error answers: a message to show. */
export const errorResponse = z.object({ error: z.string() });

/** The body of an API error, as {@link errorResponse} parses it. */
export type ErrorResponse = z.infer<typeof errorResponse>;

/**
 * What a user may do in pg_select1: an admin manages users and connections. Editors and viewers
 * can do the same things until there are saved queries and alerts to edit.
 */
export const role = z.enum(["admin", "editor", "viewer"]);

/** One of the {@link role}s. */
export type Role = z.infer<typeof role>;

/** Every role, most powerful first, for pickers and labels. */
export const roles: readonly Role[] = role.options;

/** Who's signed in, as `GET /api/me` answers. */
export const me = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role,
});

/** The signed-in user, as {@link me} parses it. */
export type Me = z.infer<typeof me>;

/** The fewest characters a password can have, which Better Auth enforces too. */
export const MIN_PASSWORD_LENGTH = 12;

// A user's name, as an admin or they themselves give it.
const userName = z.string().trim().min(1, "Give a name").max(200);

/** The body of `PATCH /api/me`: the signed-in user's new name. Their email and role stay. */
export const updateMeRequest = z.object({ name: userName });

/** A change to the signed-in user, as {@link updateMeRequest} parses it. */
export type UpdateMeRequest = z.infer<typeof updateMeRequest>;

/**
 * A user as an admin sees them in `GET /api/users`. `invited` means they haven't set a password
 * from their invite link yet.
 */
export const user = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role,
  status: z.enum(["invited", "active"]),
  createdAt: z.iso.datetime(),
});

/** A user, as {@link user} parses it. */
export type User = z.infer<typeof user>;

/** What `GET /api/users` answers: every user, oldest first. */
export const userList = z.object({ users: z.array(user) });

/** The body of `POST /api/users`: who to invite and with what role. */
export const inviteUserRequest = z.object({
  email: z.email().trim().toLowerCase(),
  name: userName,
  role,
});

/** An invite, as {@link inviteUserRequest} parses it. */
export type InviteUserRequest = z.infer<typeof inviteUserRequest>;

/** The body of `PATCH /api/users/:id`: the fields to change. */
export const updateUserRequest = z.object({
  name: userName.optional(),
  role: role.optional(),
});

/** A change to a user, as {@link updateUserRequest} parses it. */
export type UpdateUserRequest = z.infer<typeof updateUserRequest>;

/**
 * A link that lets a user set their password, valid until `expiresAt`. pg_select1 doesn't send
 * email, so the admin passes it on.
 */
export const setPasswordLink = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

/** A set-password link, as {@link setPasswordLink} parses it. */
export type SetPasswordLink = z.infer<typeof setPasswordLink>;

/** What `POST /api/users` answers: the invited user and the link to send them. */
export const inviteUserResponse = z.object({ user, link: setPasswordLink });

/** The body of a `POST /api/users` response, as {@link inviteUserResponse} parses it. */
export type InviteUserResponse = z.infer<typeof inviteUserResponse>;

/**
 * How pg_select1 uses TLS to reach a connection's database, like libpq's `sslmode`: not at all,
 * encrypted without checking the server's certificate, or encrypted with the certificate checked
 * against the host name.
 */
export const sslMode = z.enum(["disable", "require", "verify-full"]);

/** One of the {@link sslMode}s. */
export type SslMode = z.infer<typeof sslMode>;

/** Every SSL mode, least strict first, for pickers. */
export const sslModes: readonly SslMode[] = sslMode.options;

/**
 * A connection's name: the prefix of what pg_select1 creates for it in its own database when it's
 * queried across connections, and of the schemas people write then (`docs/queries.md`). Hence
 * Postgres's rules for names, minus `pg_`, which it reserves, and `__`, which separates a
 * connection's name from a schema's.
 */
export const connectionName = z
  .string()
  .trim()
  .min(1, "A connection needs a name")
  .max(40, "Use at most 40 characters")
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, digits and _, starting with a letter")
  .refine((name) => !name.includes("__"), "Don't use __ in a name")
  .refine((name) => !name.startsWith("pg_"), "Postgres reserves names that start with pg_");

/**
 * A connection as an admin sees it in `GET /api/connections`: where its database is and who it
 * connects as, but never its password, only whether it has one.
 */
export const connection = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number().int(),
  database: z.string(),
  username: z.string(),
  hasPassword: z.boolean(),
  sslMode,
  visible: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A connection, as {@link connection} parses it. */
export type Connection = z.infer<typeof connection>;

/** What `GET /api/connections` answers: every connection, by name. */
export const connectionList = z.object({ connections: z.array(connection) });

// Where a database is and who to connect as: what a test needs, and a connection besides its name.
const target = {
  host: z.string().trim().min(1, "A connection needs a host").max(255),
  port: z.number().int().min(1).max(65_535),
  database: z.string().trim().min(1, "A connection needs a database").max(63),
  username: z.string().trim().min(1, "A connection needs a user").max(63),
  sslMode,
};

// A blank password is no password, so a form's empty field can be sent as it is.
const password = z
  .string()
  .max(1000)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/**
 * The body of `POST /api/connections`. A connection is hidden unless `visible` says otherwise:
 * only admins can use it until then.
 */
export const createConnectionRequest = z.object({
  name: connectionName,
  ...target,
  password,
  visible: z.boolean().default(false),
});

/** A new connection, as {@link createConnectionRequest} parses it. */
export type CreateConnectionRequest = z.input<typeof createConnectionRequest>;

/**
 * The body of `PATCH /api/connections/:id`: the fields to change. A missing or blank `password`
 * keeps the saved one.
 */
export const updateConnectionRequest = z.object({
  name: connectionName.optional(),
  host: target.host.optional(),
  port: target.port.optional(),
  database: target.database.optional(),
  username: target.username.optional(),
  sslMode: sslMode.optional(),
  password,
  visible: z.boolean().optional(),
});

/** A change to a connection, as {@link updateConnectionRequest} parses it. */
export type UpdateConnectionRequest = z.input<typeof updateConnectionRequest>;

/**
 * The body of `POST /api/connections/test`: a database to try connecting to, as a form has it
 * before it's saved. Without a `password`, `connectionId`'s saved one is used, so editing a
 * connection can test it without typing the password again.
 */
export const testConnectionRequest = z.object({
  ...target,
  password,
  connectionId: z.uuid().optional(),
});

/** A connection to test, as {@link testConnectionRequest} parses it. */
export type TestConnectionRequest = z.input<typeof testConnectionRequest>;

/**
 * What testing a connection answers: the server's version and how long connecting and asking
 * for it took, or why it failed.
 */
export const testConnectionResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), serverVersion: z.string(), latencyMs: z.number() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

/** The result of testing a connection, as {@link testConnectionResult} parses it. */
export type TestConnectionResult = z.infer<typeof testConnectionResult>;

/**
 * A connection as anyone signed in sees it to explore: only its name. Admins see every
 * connection, everyone else only the visible ones.
 */
export const explorableConnection = z.object({ id: z.string(), name: z.string() });

/** A connection to explore, as {@link explorableConnection} parses it. */
export type ExplorableConnection = z.infer<typeof explorableConnection>;

/** What `GET /api/explore/connections` answers: the connections the caller can explore, by name. */
export const explorableConnectionList = z.object({
  connections: z.array(explorableConnection),
});

/** The kinds of relation the explorer lists, as `pg_class.relkind` names them. */
export const tableKind = z.enum([
  "table",
  "view",
  "materialized view",
  "partitioned table",
  "foreign table",
]);

/** One of the {@link tableKind}s. */
export type TableKind = z.infer<typeof tableKind>;

/** A table, view or the like in a target database, by schema and name. */
export const targetTable = z.object({ schema: z.string(), name: z.string(), kind: tableKind });

/** A table in a target database, as {@link targetTable} parses it. */
export type TargetTable = z.infer<typeof targetTable>;

/**
 * What `GET /api/explore/connections/:id/tables` answers: the tables, views, materialized views
 * and partitioned tables in a connection's database outside Postgres's own schemas, by schema
 * then name. Partitions aren't listed apart from their parent.
 */
export const targetTableList = z.object({ tables: z.array(targetTable) });

/** A column of a table's rows: its name and its type as Postgres writes it, like `varchar(80)`. */
export const resultColumn = z.object({ name: z.string(), type: z.string() });

/** A column, as {@link resultColumn} parses it. */
export type ResultColumn = z.infer<typeof resultColumn>;

/**
 * What `GET /api/explore/connections/:id/rows` answers: a table's columns and its rows, each
 * value as Postgres prints it, or `null`. At most `rowCap` rows come back; `truncated` says
 * there are more.
 */
export const tableRows = z.object({
  columns: z.array(resultColumn),
  rows: z.array(z.array(z.string().nullable())),
  truncated: z.boolean(),
  rowCap: z.number().int(),
});

/** A table's rows, as {@link tableRows} parses it. */
export type TableRows = z.infer<typeof tableRows>;

/** The longest SQL a query may be, in characters. */
export const MAX_SQL_LENGTH = 100_000;

/**
 * The most rows of a query the explorer reads, page by page. Each page runs the statement again
 * and skips the rows before it, so pages far down would read ever more of the database's rows.
 */
export const MAX_QUERY_ROWS = 10_000;

/**
 * What `POST /api/explore/connections/:id/query` takes: one SQL statement to run, an id the
 * browser picks for this run, to cancel it by with `POST /api/explore/queries/:runId/cancel`, and
 * how many of its rows to skip, for a page past the first.
 */
export const runQueryRequest = z.object({
  sql: z
    .string({ message: "Write a query" })
    .trim()
    .min(1, "Write a query")
    .max(MAX_SQL_LENGTH, `A query is at most ${MAX_SQL_LENGTH.toLocaleString("en")} characters`),
  runId: z.uuid({ message: "A run's id is a UUID" }).optional(),
  offset: z
    .number()
    .int()
    .min(0)
    .max(
      MAX_QUERY_ROWS,
      `The explorer reads at most ${MAX_QUERY_ROWS.toLocaleString("en")} rows of a query`,
    )
    .optional(),
});

/** A query to run, as {@link runQueryRequest} takes it. */
export type RunQueryRequest = z.input<typeof runQueryRequest>;

/**
 * What `POST /api/explore/connections/:id/query` answers: the columns the statement returns, with
 * their types, and its rows as {@link tableRows} has them, with how long it took on the database.
 */
export const queryResult = tableRows.extend({ durationMs: z.number() });

/** A query's result, as {@link queryResult} parses it. */
export type QueryResult = z.infer<typeof queryResult>;
