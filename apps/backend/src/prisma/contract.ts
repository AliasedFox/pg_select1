import { defineContract, enumType, member } from "@prisma/orm-postgres/contract-builder";

/**
 * What a user may do: an admin manages users and connections, an editor also shares saved
 * queries with everyone, and a viewer saves queries only for themselves.
 */
const Role = enumType(
  "Role",
  { codecId: "pg/text@1" },
  member("admin", "admin"),
  member("editor", "editor"),
  member("viewer", "viewer"),
);

/** Light or dark for a user's pages: the system's (the default), or light or dark whatever it says. */
const Theme = enumType(
  "Theme",
  { codecId: "pg/text@1" },
  member("system", "system"),
  member("light", "light"),
  member("dark", "dark"),
);

/** How a connection uses TLS, named after libpq's `sslmode`s it behaves like. */
const SslMode = enumType(
  "SslMode",
  { codecId: "pg/text@1" },
  member("disable", "disable"),
  member("require", "require"),
  member("verify-full", "verify-full"),
);

/** Who sees a saved query or a dashboard: only the user who saved it, or everyone signed in. */
const QueryScope = enumType(
  "QueryScope",
  { codecId: "pg/text@1" },
  member("personal", "personal"),
  member("global", "global"),
);

/**
 * How a saved query's result is shown, in the explorer and on dashboards: as a table of its
 * rows, as a chart, or as the one number in its first row's first column.
 */
const QueryDisplay = enumType(
  "QueryDisplay",
  { codecId: "pg/text@1" },
  member("table", "table"),
  member("chart", "chart"),
  member("number", "number"),
);

/** How a chart of a saved query's result draws it: as bars, a line, an area or a pie. */
const ChartKind = enumType(
  "ChartKind",
  { codecId: "pg/text@1" },
  member("bar", "bar"),
  member("line", "line"),
  member("area", "area"),
  member("pie", "pie"),
);

/**
 * The schema of pg_select1's own database, every table in the `public` schema.
 *
 * After changing it, run `prisma contract emit`, then `prisma migration plan --name <change>`
 * and `prisma db migrate`. Target databases are never described here.
 *
 * `User`, `Session`, `Account` and `Verification` are Better Auth's tables: it reads and writes
 * them through `pg` (`src/auth.ts` maps its field names to these columns), and Prisma owns
 * their DDL like every other table's.
 */
export const contract = defineContract(
  { naming: { columns: "snake_case" } },
  ({ field, model, rel, type, gen }) => {
    const Id = field.column(type.Uuid()).id().onCreate(gen.uuid(7));
    const UserId = field.column(type.Uuid());
    const CreatedAt = field.column(type.temporal.CreatedAt());
    const UpdatedAt = field.column(type.temporal.UpdatedAt());

    const User = model("User", {
      fields: {
        id: Id,
        name: field.column(type.String()),
        email: field.column(type.String()).unique(),
        emailVerified: field.column(type.Boolean()).default(false),
        image: field.column(type.String()).optional(),
        role: field.namedType(Role).default("viewer"),
        theme: field.namedType(Theme).default("system"),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
    }).sql({ table: "users" });

    const Session = model("Session", {
      fields: {
        id: Id,
        token: field.column(type.String()).unique(),
        userId: UserId,
        expiresAt: field.column(type.DateTime()),
        ipAddress: field.column(type.String()).optional(),
        userAgent: field.column(type.String()).optional(),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
      relations: {
        user: rel
          .belongsTo(User, { from: "userId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
      },
    }).sql({ table: "sessions" });

    // One per way a user signs in: `credential` holds the password hash, an OIDC provider its tokens.
    const Account = model("Account", {
      fields: {
        id: Id,
        userId: UserId,
        providerId: field.column(type.String()),
        accountId: field.column(type.String()),
        password: field.column(type.String()).optional(),
        accessToken: field.column(type.String()).optional(),
        refreshToken: field.column(type.String()).optional(),
        idToken: field.column(type.String()).optional(),
        accessTokenExpiresAt: field.column(type.DateTime()).optional(),
        refreshTokenExpiresAt: field.column(type.DateTime()).optional(),
        scope: field.column(type.String()).optional(),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
      relations: {
        user: rel
          .belongsTo(User, { from: "userId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
      },
    }).sql({ table: "accounts" });

    // Short-lived tokens, such as the one in an invite or password reset link.
    const Verification = model("Verification", {
      fields: {
        id: Id,
        identifier: field.column(type.String()),
        value: field.column(type.String()),
        expiresAt: field.column(type.DateTime()),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
    }).sql(({ cols, constraints }) => ({
      table: "verifications",
      indexes: [constraints.index([cols.identifier])],
    }));

    // A target database people explore and alert on. Only admins see the credentials' fields,
    // and the password never leaves the API: it's AES-GCM ciphertext (`src/crypto.ts`).
    // Non-admins can use a connection only once an admin makes it visible.
    const Connection = model("Connection", {
      fields: {
        id: Id,
        name: field.column(type.String()).unique(),
        host: field.column(type.String()),
        port: field.column(type.Int()),
        database: field.column(type.String()),
        username: field.column(type.String()),
        encryptedPassword: field.column(type.String()).optional(),
        sslMode: field.namedType(SslMode).default("require"),
        visible: field.column(type.Boolean()).default(false),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
    }).sql({ table: "connections" });

    // A query someone saved to run again. A personal one goes with its owner; a global one stays
    // when its owner is deleted, with no owner (`src/modules/user/service.ts` deletes the
    // personal ones first). Its result is shown as `display` says; the `chart*` fields are set
    // only for a chart, and its columns are by name, `null` for the one the chart picks.
    const SavedQuery = model("SavedQuery", {
      fields: {
        id: Id,
        name: field.column(type.String()),
        description: field.column(type.String()).optional(),
        sql: field.column(type.String()),
        scope: field.namedType(QueryScope).default("personal"),
        display: field.namedType(QueryDisplay).default("table"),
        chartKind: field.namedType(ChartKind).optional(),
        chartX: field.column(type.String()).optional(),
        chartY: field.column(type.String()).optional(),
        ownerId: field.column(type.Uuid()).optional(),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
      relations: {
        owner: rel
          .belongsTo(User, { from: "ownerId", to: "id" })
          .sql({ fk: { onDelete: "setNull" } }),
      },
    }).sql(({ cols, constraints }) => ({
      table: "saved_queries",
      indexes: [constraints.index([cols.ownerId])],
    }));

    // The connections a saved query runs on, first one first (`docs/queries.md`). Deleting a
    // connection takes it out of its saved queries, which can then be run on another.
    const SavedQueryConnection = model("SavedQueryConnection", {
      fields: {
        savedQueryId: field.column(type.Uuid()),
        connectionId: field.column(type.Uuid()),
        position: field.column(type.Int()),
      },
      relations: {
        savedQuery: rel
          .belongsTo(SavedQuery, { from: "savedQueryId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
        connection: rel
          .belongsTo(Connection, { from: "connectionId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
      },
    })
      .attributes(({ fields, constraints }) => ({
        id: constraints.id([fields.savedQueryId, fields.connectionId]),
      }))
      .sql(({ cols, constraints }) => ({
        table: "saved_query_connections",
        indexes: [constraints.index([cols.connectionId])],
      }));

    // Saved queries shown together, one under another. Who sees it and who can change it go as
    // for a saved query, and so does what happens to it when its owner is deleted.
    const Dashboard = model("Dashboard", {
      fields: {
        id: Id,
        name: field.column(type.String()),
        description: field.column(type.String()).optional(),
        scope: field.namedType(QueryScope).default("personal"),
        ownerId: field.column(type.Uuid()).optional(),
        createdAt: CreatedAt,
        updatedAt: UpdatedAt,
      },
      relations: {
        owner: rel
          .belongsTo(User, { from: "ownerId", to: "id" })
          .sql({ fk: { onDelete: "setNull" } }),
      },
    }).sql(({ cols, constraints }) => ({
      table: "dashboards",
      indexes: [constraints.index([cols.ownerId])],
    }));

    // A saved query on a dashboard, first one first, shown as the query's `display` says. The same
    // query can be on a dashboard more than once. Deleting the query takes it off its dashboards.
    const DashboardItem = model("DashboardItem", {
      fields: {
        id: Id,
        dashboardId: field.column(type.Uuid()),
        savedQueryId: field.column(type.Uuid()),
        position: field.column(type.Int()),
      },
      relations: {
        dashboard: rel
          .belongsTo(Dashboard, { from: "dashboardId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
        savedQuery: rel
          .belongsTo(SavedQuery, { from: "savedQueryId", to: "id" })
          .sql({ fk: { onDelete: "cascade" } }),
      },
    }).sql(({ cols, constraints }) => ({
      table: "dashboard_items",
      indexes: [constraints.index([cols.dashboardId]), constraints.index([cols.savedQueryId])],
    }));

    return {
      enums: { Role, Theme, SslMode, QueryScope, QueryDisplay, ChartKind },
      models: {
        User,
        Session,
        Account,
        Verification,
        Connection,
        SavedQuery,
        SavedQueryConnection,
        Dashboard,
        DashboardItem,
      },
    };
  },
);
