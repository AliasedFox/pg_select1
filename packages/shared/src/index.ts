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
 * What a user may do in pg_select1: an admin manages users and connections, an editor also
 * shares saved queries with everyone, and a viewer saves queries only for themselves.
 */
export const role = z.enum(["admin", "editor", "viewer"]);

/** One of the {@link role}s. */
export type Role = z.infer<typeof role>;

/** Every role, most powerful first, for pickers and labels. */
export const roles: readonly Role[] = role.options;

/** Light or dark for a user's pages: the system's (the default), or light or dark whatever it says. */
export const theme = z.enum(["system", "light", "dark"]);

/** One of the {@link theme}s. */
export type Theme = z.infer<typeof theme>;

/** Who's signed in, as `GET /api/me` answers, with the theme they picked. */
export const me = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role,
  theme,
});

/** The signed-in user, as {@link me} parses it. */
export type Me = z.infer<typeof me>;

/** The fewest characters a password can have, which Better Auth enforces too. */
export const MIN_PASSWORD_LENGTH = 12;

// A user's name, as an admin or they themselves give it.
const userName = z.string().trim().min(1, "Give a name").max(200);

/** The body of `PATCH /api/me`: the signed-in user's new name or theme. Their email and role stay. */
export const updateMeRequest = z.object({ name: userName.optional(), theme: theme.optional() });

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
 * A function in a target database, by schema and name, with its arguments as
 * `pg_get_function_identity_arguments` writes them, like `a integer, b text`, which tell
 * overloads of one name apart.
 */
export const targetFunction = z.object({
  schema: z.string(),
  name: z.string(),
  arguments: z.string(),
});

/** A function in a target database, as {@link targetFunction} parses it. */
export type TargetFunction = z.infer<typeof targetFunction>;

/**
 * What `GET /api/explore/connections/:id/tables` answers: the tables, views, materialized views,
 * partitioned and foreign tables in a connection's database outside Postgres's own schemas, by
 * schema then name, and its functions, but those of extensions, the same way. Partitions aren't
 * listed apart from their parent.
 */
export const targetTableList = z.object({
  tables: z.array(targetTable),
  functions: z.array(targetFunction),
});

/** What {@link targetTableList} parses: a connection's tables and functions. */
export type TargetTableList = z.infer<typeof targetTableList>;

/**
 * What `GET /api/explore/connections/:id/function` answers: a function's definition, as the
 * `CREATE OR REPLACE FUNCTION` statement `pg_get_functiondef` writes.
 */
export const functionDefinition = z.object({ definition: z.string() });

/**
 * What `GET /api/explore/connections/:id/structure` answers: how a table is made, as Postgres
 * describes it in its catalog. Its columns, with whether they take nulls, their default, which for
 * an identity or generated column says so, and whether they're in its primary key. Its
 * constraints but the not-null ones, which the columns say; its indexes, with their size; its
 * triggers, but those Postgres keeps for itself; and the foreign keys of other tables that refer
 * to it. A view or materialized view has its
 * definition, and a partitioned table its partition key and partitions. `rowEstimate` is
 * Postgres's estimate from its last `ANALYZE`, or null when it hasn't made one, and `size` is a
 * table's or materialized view's with its indexes and TOAST, as `pg_size_pretty` writes it.
 */
export const tableStructure = z.object({
  schema: z.string(),
  name: z.string(),
  kind: tableKind,
  comment: z.string().nullable(),
  rowEstimate: z.number().nullable(),
  size: z.string().nullable(),
  columns: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      notNull: z.boolean(),
      default: z.string().nullable(),
      primaryKey: z.boolean(),
      comment: z.string().nullable(),
    }),
  ),
  constraints: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["primary key", "unique", "foreign key", "check", "exclusion"]),
      definition: z.string(),
    }),
  ),
  indexes: z.array(
    z.object({
      name: z.string(),
      definition: z.string(),
      primary: z.boolean(),
      unique: z.boolean(),
      // An index left invalid by a `CREATE INDEX CONCURRENTLY` that failed, which no query uses.
      valid: z.boolean(),
      size: z.string().nullable(),
    }),
  ),
  triggers: z.array(z.object({ name: z.string(), definition: z.string(), enabled: z.boolean() })),
  referencedBy: z.array(
    z.object({ name: z.string(), schema: z.string(), table: z.string(), definition: z.string() }),
  ),
  definition: z.string().nullable(),
  partitionKey: z.string().nullable(),
  partitions: z.array(z.object({ schema: z.string(), name: z.string(), bound: z.string() })),
});

/** A table's structure, as {@link tableStructure} parses it. */
export type TableStructure = z.infer<typeof tableStructure>;

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

// One SQL statement, as a query to run or save has it.
const querySql = z
  .string({ message: "Write a query" })
  .trim()
  .min(1, "Write a query")
  .max(MAX_SQL_LENGTH, `A query is at most ${MAX_SQL_LENGTH.toLocaleString("en")} characters`);

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
  sql: querySql,
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

/**
 * Who sees a saved query or a dashboard: only the user who saved it (`personal`), or everyone signed in
 * (`global`). Only editors and admins share queries with everyone.
 */
export const queryScope = z.enum(["personal", "global"]);

/** One of the {@link queryScope}s. */
export type QueryScope = z.infer<typeof queryScope>;

/** The kinds of chart a result can be drawn as: bars, a line, the area under a line, or a pie. */
export const chartKind = z.enum(["bar", "line", "area", "pie"]);

/** One of the {@link chartKind}s. */
export type ChartKind = z.infer<typeof chartKind>;

/**
 * How a saved query's result is shown, in the explorer as it opens and on dashboards: as a
 * table of its rows, as a chart of the kind it says, or as the one number in its first row's
 * first column. A chart's columns aren't kept: they're read from the order of the result's.
 */
export const queryDisplay = z.discriminatedUnion("type", [
  z.object({ type: z.literal("table") }),
  z.object({ type: z.literal("chart"), kind: chartKind }),
  z.object({ type: z.literal("number") }),
]);

/** How a saved query's result is shown, as {@link queryDisplay} parses it. */
export type QueryDisplay = z.infer<typeof queryDisplay>;

/** One of the ways a {@link queryDisplay} shows a result. */
export type QueryDisplayType = QueryDisplay["type"];

/**
 * A saved query as `GET /api/saved-queries` answers it: its SQL, the connections it runs on,
 * first one first, who sees it and how its result is shown. `connections` holds only those the caller can explore, so
 * it's empty when they were deleted or hidden. `owner` is who saved it, `null` once they've been
 * deleted, and `canEdit` whether the caller can change or delete it.
 */
export const savedQuery = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sql: z.string(),
  scope: queryScope,
  connections: z.array(explorableConnection),
  display: queryDisplay,
  owner: z.object({ id: z.string(), name: z.string() }).nullable(),
  canEdit: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A saved query, as {@link savedQuery} parses it. */
export type SavedQuery = z.infer<typeof savedQuery>;

/** What `GET /api/saved-queries` answers: the saved queries the caller sees, by name. */
export const savedQueryList = z.object({ savedQueries: z.array(savedQuery) });

const savedQueryName = z.string().trim().min(1, "Give the query a name").max(200);

// A blank description is none, so a form's empty field can be sent as it is.
const savedQueryDescription = z
  .string()
  .trim()
  .max(2000, "Use at most 2,000 characters")
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : value));

// The connections a saved query runs on. Queries across connections aren't built yet, so it's
// one for now.
const savedQueryConnectionIds = z
  .array(z.uuid({ message: "There's no such connection" }))
  .min(1, "Pick a database")
  .max(1, "A query runs on one database for now");

/**
 * The body of `POST /api/saved-queries`: a query to save, personal unless `scope` says global,
 * and shown as a table unless `display` says otherwise.
 */
export const createSavedQueryRequest = z.object({
  name: savedQueryName,
  description: savedQueryDescription,
  sql: querySql,
  scope: queryScope.default("personal"),
  connectionIds: savedQueryConnectionIds,
  display: queryDisplay.default({ type: "table" }),
});

/** A query to save, as {@link createSavedQueryRequest} takes it. */
export type CreateSavedQueryRequest = z.input<typeof createSavedQueryRequest>;

/**
 * The body of `PATCH /api/saved-queries/:id`: the fields to change. A blank or `null`
 * `description` removes it.
 */
export const updateSavedQueryRequest = z.object({
  name: savedQueryName.optional(),
  description: savedQueryDescription,
  sql: querySql.optional(),
  scope: queryScope.optional(),
  connectionIds: savedQueryConnectionIds.optional(),
  display: queryDisplay.optional(),
});

/** A change to a saved query, as {@link updateSavedQueryRequest} takes it. */
export type UpdateSavedQueryRequest = z.input<typeof updateSavedQueryRequest>;

/**
 * What's on a dashboard, one under another: a saved query, shown as the query's `display` says,
 * or a title over the queries after it. A query's `savedQuery` is `null` when the caller doesn't
 * see it, as with someone else's personal query on a global dashboard; `savedQueryId` is there
 * all the same, so the dashboard can be changed without losing it.
 */
export const dashboardItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("query"),
    id: z.string(),
    savedQueryId: z.string(),
    savedQuery: savedQuery.nullable(),
  }),
  z.object({ kind: z.literal("title"), id: z.string(), title: z.string() }),
]);

/** A saved query or a title on a dashboard, as {@link dashboardItem} parses it. */
export type DashboardItem = z.infer<typeof dashboardItem>;

/** How often a dashboard can run its queries again by itself, in minutes. */
export const DASHBOARD_REFRESH_MINUTES = [3, 5, 10, 15, 30, 60] as const;

/** One of the {@link DASHBOARD_REFRESH_MINUTES}. */
export type DashboardRefreshMinutes = (typeof DASHBOARD_REFRESH_MINUTES)[number];

/**
 * A dashboard as `GET /api/dashboards` answers it: its title, description and who sees it, as
 * for a saved query, how many queries are on it, titles aside, and how often it runs them again
 * by itself while it's open, in minutes, `null` for only when asked. `owner` is who made it,
 * `null` once they've been deleted, and `canEdit` whether the caller can change or delete it.
 */
export const dashboardSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  scope: queryScope,
  itemCount: z.number().int(),
  refreshMinutes: z.number().int().nullable(),
  owner: z.object({ id: z.string(), name: z.string() }).nullable(),
  canEdit: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A dashboard in a list, as {@link dashboardSummary} parses it. */
export type DashboardSummary = z.infer<typeof dashboardSummary>;

/** What `GET /api/dashboards` answers: the dashboards the caller sees, by name. */
export const dashboardList = z.object({ dashboards: z.array(dashboardSummary) });

/** A dashboard as `GET /api/dashboards/:id` answers it: its summary and its queries, in order. */
export const dashboard = dashboardSummary.extend({ items: z.array(dashboardItem) });

/** A dashboard, as {@link dashboard} parses it. */
export type Dashboard = z.infer<typeof dashboard>;

/** The most queries and titles a dashboard can have, together. */
export const MAX_DASHBOARD_ITEMS = 50;

const dashboardName = z.string().trim().min(1, "Give the dashboard a title").max(200);

/** A saved query to put on a dashboard, by its id, or a title: one or the other. */
export const dashboardItemInput = z
  .object({
    savedQueryId: z.uuid({ message: "There's no such saved query" }).optional(),
    title: z.string().trim().min(1, "Give the title some text").max(200).optional(),
  })
  .refine((item) => (item.savedQueryId === undefined) !== (item.title === undefined), {
    message: "Put a saved query or a title on a dashboard",
  });

/** A saved query or a title to put on a dashboard, as {@link dashboardItemInput} takes it. */
export type DashboardItemInput = z.input<typeof dashboardItemInput>;

// What's on a dashboard, first one first, each replacing what was there.
const dashboardItems = z
  .array(dashboardItemInput)
  .max(MAX_DASHBOARD_ITEMS, `A dashboard has at most ${MAX_DASHBOARD_ITEMS} queries and titles`);

// How often a dashboard runs its queries again by itself, or `null` for only when asked.
const dashboardRefresh = z
  .literal(DASHBOARD_REFRESH_MINUTES, {
    message: "Run them again every 3, 5, 10, 15 or 30 minutes, or every hour",
  })
  .nullable();

/**
 * The body of `POST /api/dashboards`: a dashboard to make, personal unless `scope` says global,
 * with the saved queries and titles on it, if any yet, first one first, each query once. It runs
 * its queries again only when asked unless `refreshMinutes` says how often.
 */
export const createDashboardRequest = z.object({
  name: dashboardName,
  description: savedQueryDescription,
  scope: queryScope.default("personal"),
  refreshMinutes: dashboardRefresh.default(null),
  items: dashboardItems.default([]),
});

/** A dashboard to make, as {@link createDashboardRequest} takes it. */
export type CreateDashboardRequest = z.input<typeof createDashboardRequest>;

/**
 * The body of `PATCH /api/dashboards/:id`: the fields to change. `items`, when given, replaces
 * every query and title on it, in the order given, so it's how they're added, removed and moved;
 * a query that's on it already can't be added again. A blank or `null` `description` removes it,
 * and a `null` `refreshMinutes` has it run its queries again only when asked.
 */
export const updateDashboardRequest = z.object({
  name: dashboardName.optional(),
  description: savedQueryDescription,
  scope: queryScope.optional(),
  refreshMinutes: dashboardRefresh.optional(),
  items: dashboardItems.optional(),
});

/** A change to a dashboard, as {@link updateDashboardRequest} takes it. */
export type UpdateDashboardRequest = z.input<typeof updateDashboardRequest>;
