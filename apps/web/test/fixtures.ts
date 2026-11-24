import {
  type Connection,
  createConnectionRequest,
  inviteUserRequest,
  type Me,
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
};

/** A viewer, for a test or story signed in as someone who isn't an admin. */
export const viewer: Me = {
  id: "0199a1b2-0000-7000-8000-000000000003",
  email: "vic@example.com",
  name: "Vic Viewer",
  role: "viewer",
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
    const { name } = updateMeRequest.parse(await request.json());
    return HttpResponse.json({ ...admin, name });
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
