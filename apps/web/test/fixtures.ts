import {
  type Connection,
  createConnectionRequest,
  createDashboardRequest,
  type Dashboard,
  type DashboardSummary,
  updateDashboardRequest,
  createSavedQueryRequest,
  type SavedQuery,
  updateSavedQueryRequest,
  type TableRows,
  type TargetTable,
  inviteUserRequest,
  type Me,
  type QueryResult,
  updateMeRequest,
  updateUserRequest,
  updateConnectionRequest,
  type User,
} from "@pg_select1/shared";
import { http, HttpResponse } from "msw";

/** The admin tests and stories are signed in as by default. */
export const admin: Me = {
  id: "0199a1b2-0000-7000-8000-000000000001",
  email: "ada@example.com",
  name: "Ada Admin",
  role: "admin",
  theme: "system",
};

/** A viewer, for a test or story signed in as someone who isn't an admin. */
export const viewer: Me = {
  id: "0199a1b2-0000-7000-8000-000000000003",
  email: "vic@example.com",
  name: "Vic Viewer",
  role: "viewer",
  theme: "system",
};

/** The users `GET /api/users` answers by default: the admin, an editor, and someone invited. */
export const users: User[] = [
  { ...admin, status: "active", createdAt: "2026-01-01T09:00:00.000Z" },
  {
    id: "0199a1b2-0000-7000-8000-000000000002",
    email: "eddie@example.com",
    name: "Eddie Editor",
    role: "editor",
    status: "active",
    createdAt: "2026-01-02T09:00:00.000Z",
  },
  {
    ...viewer,
    status: "invited",
    createdAt: "2026-01-03T09:00:00.000Z",
  },
];

/** The set-password link the fake API makes. */
export const link = {
  url: "http://localhost:5190/set-password?token=fake-token",
  expiresAt: "2026-01-10T09:00:00.000Z",
};

/** The connections `GET /api/connections` answers by default: one visible, one hidden. */
export const connections: Connection[] = [
  {
    id: "0199a1b2-0000-7000-8000-0000000000c1",
    name: "billing",
    host: "billing.internal",
    port: 5432,
    database: "billing",
    username: "reader",
    hasPassword: true,
    sslMode: "verify-full",
    visible: false,
    createdAt: "2026-01-02T09:00:00.000Z",
    updatedAt: "2026-01-02T09:00:00.000Z",
  },
  {
    id: "0199a1b2-0000-7000-8000-0000000000c2",
    name: "shop",
    host: "localhost",
    port: 5432,
    database: "shop",
    username: "postgres",
    hasPassword: true,
    sslMode: "disable",
    visible: true,
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
  },
];

/** The tables `GET /api/explore/connections/:id/tables` answers for any connection. */
export const tables: TargetTable[] = [
  { schema: "public", name: "customers", kind: "table" },
  { schema: "public", name: "orders", kind: "table" },
  { schema: "reporting", name: "daily_sales", kind: "materialized view" },
  { schema: "reporting", name: "open_orders", kind: "view" },
];

/** A table's rows: the customers'. */
export const customerRows: TableRows = {
  columns: [
    { name: "id", type: "bigint" },
    { name: "email", type: "text" },
    { name: "name", type: "character varying(80)" },
    { name: "created_at", type: "timestamp with time zone" },
  ],
  rows: [
    ["1", "ada@example.com", "Ada Lovelace", "2026-01-02 09:00:00+00"],
    ["2", "grace@example.com", "Grace Hopper", "2026-01-03 10:30:00+00"],
    ["3", "alan@example.com", null, "2026-01-04 11:45:00+00"],
  ],
  truncated: false,
  rowCap: 200,
};

/** What `POST /api/explore/connections/:id/query` answers for any query: the customers' rows. */
export const queryRows: QueryResult = { ...customerRows, durationMs: 12 };

/** What the Daily signups saved query answers, for a chart of it: new customers on each day. */
export const signupRows: QueryResult = {
  columns: [
    { name: "day", type: "date" },
    { name: "count", type: "bigint" },
  ],
  rows: [
    ["2026-01-02", "4"],
    ["2026-01-03", "7"],
    ["2026-01-04", "5"],
  ],
  truncated: false,
  rowCap: 200,
  durationMs: 8,
};

/**
 * The saved queries `GET /api/saved-queries` answers by default, by name: a global one on shop,
 * the admin's own personal one, and an editor's global one whose database was deleted.
 */
export const savedQueries: SavedQuery[] = [
  {
    id: "0199a1b2-0000-7000-8000-0000000000a1",
    name: "Daily signups",
    description: "New customers per day, oldest first",
    sql: "select date_trunc('day', created_at) as day, count(*)\nfrom customers\ngroup by 1\norder by 1",
    scope: "global",
    connections: [{ id: "0199a1b2-0000-7000-8000-0000000000c2", name: "shop" }],
    display: { type: "table" },
    owner: { id: admin.id, name: admin.name },
    canEdit: true,
    createdAt: "2026-01-05T09:00:00.000Z",
    updatedAt: "2026-01-06T09:00:00.000Z",
  },
  {
    id: "0199a1b2-0000-7000-8000-0000000000a2",
    name: "Open orders",
    description: null,
    sql: "select * from reporting.open_orders",
    scope: "personal",
    connections: [{ id: "0199a1b2-0000-7000-8000-0000000000c2", name: "shop" }],
    display: { type: "table" },
    owner: { id: admin.id, name: admin.name },
    canEdit: true,
    createdAt: "2026-01-05T10:00:00.000Z",
    updatedAt: "2026-01-05T10:00:00.000Z",
  },
  {
    id: "0199a1b2-0000-7000-8000-0000000000a3",
    name: "Unpaid invoices",
    description: "Invoices sent more than 30 days ago that nobody has paid",
    sql: "select * from invoices where paid_at is null and sent_at < now() - interval '30 days'",
    scope: "global",
    connections: [],
    display: { type: "table" },
    owner: { id: "0199a1b2-0000-7000-8000-000000000002", name: "Eddie Editor" },
    canEdit: true,
    createdAt: "2026-01-04T09:00:00.000Z",
    updatedAt: "2026-01-04T09:00:00.000Z",
  },
];

// A dashboard's queries as the API answers them, from the saved queries above by id, and as
// someone else's personal query for any other.
function itemsOf(items: { savedQueryId: string }[], prefix: string): Dashboard["items"] {
  return items.map((item, index) => ({
    id: `${prefix}${index}`,
    ...item,
    savedQuery: savedQueries.find((q) => q.id === item.savedQueryId) ?? null,
  }));
}

/**
 * The dashboards `GET /api/dashboards/:id` answers by default, by title: a global one with two
 * saved queries and someone else's personal one, and the admin's own empty one.
 */
export const dashboards: Dashboard[] = [
  {
    id: "0199a1b2-0000-7000-8000-0000000000d1",
    name: "Shop overview",
    description: "How the shop's doing: who signs up, and what's waiting to ship",
    scope: "global",
    itemCount: 3,
    owner: { id: admin.id, name: admin.name },
    canEdit: true,
    createdAt: "2026-01-08T09:00:00.000Z",
    updatedAt: "2026-01-08T09:00:00.000Z",
    items: itemsOf(
      [
        { savedQueryId: "0199a1b2-0000-7000-8000-0000000000a1" },
        { savedQueryId: "0199a1b2-0000-7000-8000-0000000000a2" },
        { savedQueryId: "0199a1b2-0000-7000-8000-0000000000af" },
      ],
      "0199a1b2-0000-7000-8000-00000000010",
    ),
  },
  {
    id: "0199a1b2-0000-7000-8000-0000000000d2",
    name: "Weekly review",
    description: null,
    scope: "personal",
    itemCount: 0,
    owner: { id: admin.id, name: admin.name },
    canEdit: true,
    createdAt: "2026-01-09T09:00:00.000Z",
    updatedAt: "2026-01-09T09:00:00.000Z",
    items: [],
  },
];

/** The dashboards `GET /api/dashboards` answers by default, as summaries. */
export const dashboardSummaries: DashboardSummary[] = dashboards.map(
  ({ items: _items, ...summary }) => summary,
);

/** Answers `GET /api/me` as nobody signed in, for `server.use()` or `msw.use()`. */
export const signedOut = http.get("/api/me", () =>
  HttpResponse.json({ error: "Sign in first" }, { status: 401 }),
);

/** The API as tests and stories see it by default: everything up, and signed in as an admin. */
export const handlers = [
  http.get("/api/me", () => HttpResponse.json(admin)),
  http.post("/api/auth/sign-in/email", () => HttpResponse.json({ redirect: false, token: "t" })),
  http.post("/api/auth/sign-out", () => HttpResponse.json({ success: true })),
  http.patch("/api/me", async ({ request }) => {
    const changes = updateMeRequest.parse(await request.json());
    return HttpResponse.json({ ...admin, ...changes });
  }),
  http.post("/api/auth/reset-password", () => HttpResponse.json({ status: true })),
  http.post("/api/auth/change-password", () => HttpResponse.json({ token: "t2", user: admin })),
  http.get("/api/users", () => HttpResponse.json({ users })),
  http.post("/api/users", async ({ request }) => {
    const body = inviteUserRequest.parse(await request.json());
    const user: User = {
      id: "0199a1b2-0000-7000-8000-000000000004",
      ...body,
      status: "invited",
      createdAt: "2026-01-04T09:00:00.000Z",
    };
    return HttpResponse.json({ user, link }, { status: 201 });
  }),
  http.patch("/api/users/:id", async ({ params, request }) => {
    const existing = users.find((u) => u.id === params.id);
    if (!existing) return HttpResponse.json({ error: "There's no such user" }, { status: 404 });
    const changes = updateUserRequest.parse(await request.json());
    return HttpResponse.json({ ...existing, ...changes });
  }),
  http.delete("/api/users/:id", () => new HttpResponse(null, { status: 204 })),
  http.post("/api/users/:id/set-password-link", () => HttpResponse.json(link)),
  http.get("/api/explore/connections", () =>
    HttpResponse.json({ connections: connections.map(({ id, name }) => ({ id, name })) }),
  ),
  http.get("/api/explore/connections/:id/tables", () => HttpResponse.json({ tables })),
  http.post("/api/explore/connections/:id/query", () => HttpResponse.json(queryRows)),
  http.post("/api/explore/queries/:runId/cancel", () => new HttpResponse(null, { status: 204 })),
  http.get("/api/saved-queries", () => HttpResponse.json({ savedQueries })),
  http.get("/api/saved-queries/:id", ({ params }) => {
    const found = savedQueries.find((q) => q.id === params.id);
    if (!found) return HttpResponse.json({ error: "There's no such saved query" }, { status: 404 });
    return HttpResponse.json(found);
  }),
  http.post("/api/saved-queries", async ({ request }) => {
    const { connectionIds, description, ...body } = createSavedQueryRequest.parse(
      await request.json(),
    );
    const created: SavedQuery = {
      id: "0199a1b2-0000-7000-8000-0000000000a9",
      ...body,
      description: description ?? null,
      connections: connections
        .filter((c) => connectionIds.includes(c.id))
        .map(({ id, name }) => ({ id, name })),
      owner: { id: admin.id, name: admin.name },
      canEdit: true,
      createdAt: "2026-01-07T09:00:00.000Z",
      updatedAt: "2026-01-07T09:00:00.000Z",
    };
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("/api/saved-queries/:id", async ({ params, request }) => {
    const existing = savedQueries.find((q) => q.id === params.id);
    if (!existing) {
      return HttpResponse.json({ error: "There's no such saved query" }, { status: 404 });
    }
    const { connectionIds, ...changes } = updateSavedQueryRequest.parse(await request.json());
    return HttpResponse.json({
      ...existing,
      ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
      ...(connectionIds && {
        connections: connections
          .filter((c) => connectionIds.includes(c.id))
          .map(({ id, name }) => ({ id, name })),
      }),
      updatedAt: "2026-01-07T09:00:00.000Z",
    });
  }),
  http.delete("/api/saved-queries/:id", () => new HttpResponse(null, { status: 204 })),
  http.get("/api/dashboards", () => HttpResponse.json({ dashboards: dashboardSummaries })),
  http.get("/api/dashboards/:id", ({ params }) => {
    const found = dashboards.find((d) => d.id === params.id);
    if (!found) return HttpResponse.json({ error: "There's no such dashboard" }, { status: 404 });
    return HttpResponse.json(found);
  }),
  http.post("/api/dashboards", async ({ request }) => {
    const { description, items, ...body } = createDashboardRequest.parse(await request.json());
    const created: Dashboard = {
      id: "0199a1b2-0000-7000-8000-0000000000d9",
      ...body,
      description: description ?? null,
      itemCount: items.length,
      owner: { id: admin.id, name: admin.name },
      canEdit: true,
      createdAt: "2026-01-10T09:00:00.000Z",
      updatedAt: "2026-01-10T09:00:00.000Z",
      items: itemsOf(items, "0199a1b2-0000-7000-8000-00000000020"),
    };
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch("/api/dashboards/:id", async ({ params, request }) => {
    const existing = dashboards.find((d) => d.id === params.id);
    if (!existing) {
      return HttpResponse.json({ error: "There's no such dashboard" }, { status: 404 });
    }
    const { items, ...changes } = updateDashboardRequest.parse(await request.json());
    return HttpResponse.json({
      ...existing,
      ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
      ...(items && {
        items: itemsOf(items, "0199a1b2-0000-7000-8000-00000000030"),
        itemCount: items.length,
      }),
      updatedAt: "2026-01-10T09:00:00.000Z",
    });
  }),
  http.delete("/api/dashboards/:id", () => new HttpResponse(null, { status: 204 })),
  http.get("/api/connections", () => HttpResponse.json({ connections })),
  http.post("/api/connections", async ({ request }) => {
    const { password, ...body } = createConnectionRequest.parse(await request.json());
    const created: Connection = {
      id: "0199a1b2-0000-7000-8000-0000000000c9",
      ...body,
      hasPassword: password !== undefined,
      createdAt: "2026-01-04T09:00:00.000Z",
      updatedAt: "2026-01-04T09:00:00.000Z",
    };
    return HttpResponse.json(created, { status: 201 });
  }),
  http.post("/api/connections/test", () =>
    HttpResponse.json({ ok: true, serverVersion: "17.2", latencyMs: 12 }),
  ),
  http.patch("/api/connections/:id", async ({ params, request }) => {
    const existing = connections.find((c) => c.id === params.id);
    if (!existing) {
      return HttpResponse.json({ error: "There's no such connection" }, { status: 404 });
    }
    const { password, ...changes } = updateConnectionRequest.parse(await request.json());
    return HttpResponse.json({
      ...existing,
      ...changes,
      hasPassword: existing.hasPassword || password !== undefined,
    });
  }),
  http.delete("/api/connections/:id", () => new HttpResponse(null, { status: 204 })),
  http.post("/api/connections/:id/test", () =>
    HttpResponse.json({ ok: true, serverVersion: "17.2", latencyMs: 12 }),
  ),
];
