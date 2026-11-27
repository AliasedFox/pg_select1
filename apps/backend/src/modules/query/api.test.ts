import { describe, expect, test } from "bun:test";

import { connection, errorResponse, savedQuery, savedQueryList } from "@pg_select1/shared";

import { request, signedInAs } from "../../../test/api";
import { db } from "../../db";

function json(body: unknown, cookie: string, method = "POST"): RequestInit {
  return { method, body: JSON.stringify(body), headers: { cookie } };
}

const url = new URL(process.env.DATABASE_URL ?? "");
const admin = await signedInAs("admin");

let names = 0;
async function addConnection(visible: boolean) {
  names += 1;
  const res = await request(
    "/api/connections",
    json(
      {
        name: `saved${names}_${crypto.randomUUID().slice(0, 8)}`,
        host: url.hostname,
        port: Number(url.port),
        database: url.pathname.slice(1),
        username: "nobody",
        sslMode: "disable",
        visible,
      },
      admin.cookie,
    ),
  );
  expect(res.status).toBe(201);
  return connection.parse(await res.json());
}

const shop = await addConnection(true);
const hidden = await addConnection(false);

async function save(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await request(
    "/api/saved-queries",
    json(
      {
        name: `Query ${crypto.randomUUID().slice(0, 8)}`,
        sql: "select 1",
        connectionIds: [shop.id],
        ...overrides,
      },
      cookie,
    ),
  );
  expect(res.status).toBe(201);
  return savedQuery.parse(await res.json());
}

async function list(cookie: string) {
  const res = await request("/api/saved-queries", { headers: { cookie } });
  expect(res.status).toBe(200);
  return savedQueryList.parse(await res.json()).savedQueries;
}

async function errorOf(res: Response) {
  return errorResponse.parse(await res.json()).error;
}

describe("saving", () => {
  test("answers 401 to nobody", async () => {
    expect((await request("/api/saved-queries")).status).toBe(401);
  });

  test("a query is personal unless shared, and names its connection and owner", async () => {
    const viewer = await signedInAs("viewer");

    const saved = await save(viewer.cookie, {
      name: "  Daily signups ",
      description: "",
      sql: "select count(*) from users",
    });

    expect(saved).toMatchObject({
      name: "Daily signups",
      description: null,
      sql: "select count(*) from users",
      scope: "personal",
      connections: [{ id: shop.id, name: shop.name }],
      display: { type: "table" },
      owner: { id: viewer.id },
      canEdit: true,
    });
  });

  test("a query is shown as it's saved: a table, a number, or a chart of its kind", async () => {
    const viewer = await signedInAs("viewer");
    const chart = { type: "chart", kind: "line" } as const;

    const charted = await save(viewer.cookie, { display: chart });
    const counted = await save(viewer.cookie, { display: { type: "number" } });

    expect(charted.display).toEqual(chart);
    expect(counted.display).toEqual({ type: "number" });
  });

  test("a chart needs a kind it can draw", async () => {
    const editor = await signedInAs("editor");
    const tries = [{ type: "chart" }, { type: "chart", kind: "scatter" }, { type: "map" }];

    for (const display of tries) {
      const res = await request(
        "/api/saved-queries",
        json({ name: "Q", sql: "select 1", connectionIds: [shop.id], display }, editor.cookie),
      );
      expect(res.status).toBe(400);
    }
  });

  test("a query needs a name, SQL and one connection", async () => {
    const editor = await signedInAs("editor");
    const tries = [
      { name: "", sql: "select 1", connectionIds: [shop.id] },
      { name: "Q", sql: "  ", connectionIds: [shop.id] },
      { name: "Q", sql: "select 1", connectionIds: [] },
      { name: "Q", sql: "select 1", connectionIds: [shop.id, hidden.id] },
    ];

    for (const body of tries) {
      const res = await request("/api/saved-queries", json(body, editor.cookie));
      expect(res.status).toBe(400);
    }
  });

  test("a viewer can't share a query with everyone, but an editor can", async () => {
    const viewer = await signedInAs("viewer");
    const editor = await signedInAs("editor");

    const refused = await request(
      "/api/saved-queries",
      json(
        { name: "Q", sql: "select 1", scope: "global", connectionIds: [shop.id] },
        viewer.cookie,
      ),
    );
    const shared = await save(editor.cookie, { scope: "global" });

    expect(refused.status).toBe(403);
    expect(shared.scope).toBe("global");
  });

  test("a hidden connection is only an admin's to save a query on", async () => {
    const editor = await signedInAs("editor");

    const refused = await request(
      "/api/saved-queries",
      json({ name: "Q", sql: "select 1", connectionIds: [hidden.id] }, editor.cookie),
    );
    const saved = await save(admin.cookie, { connectionIds: [hidden.id] });

    expect(refused.status).toBe(404);
    expect(saved.connections).toEqual([{ id: hidden.id, name: hidden.name }]);
  });
});

describe("who sees what", () => {
  test("a personal query is its owner's alone; a global one everyone's, sorted by name", async () => {
    const owner = await signedInAs("editor");
    const other = await signedInAs("viewer");
    const mine = await save(owner.cookie, { name: "b mine" });
    const shared = await save(owner.cookie, { name: "a shared", scope: "global" });

    const ownerIds = (await list(owner.cookie)).map((q) => q.id);
    const otherIds = (await list(other.cookie)).map((q) => q.id);
    const adminIds = (await list(admin.cookie)).map((q) => q.id);

    expect(ownerIds.indexOf(shared.id)).toBeLessThan(ownerIds.indexOf(mine.id));
    expect(otherIds).toContain(shared.id);
    expect(otherIds).not.toContain(mine.id);
    // Not even an admin sees someone else's personal query.
    expect(adminIds).not.toContain(mine.id);
    const res = await request(`/api/saved-queries/${mine.id}`, {
      headers: { cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  });

  test("someone who can't explore a query's connection doesn't see it in the query", async () => {
    const viewer = await signedInAs("viewer");
    const saved = await save(admin.cookie, { scope: "global", connectionIds: [hidden.id] });

    const res = await request(`/api/saved-queries/${saved.id}`, {
      headers: { cookie: viewer.cookie },
    });

    expect(savedQuery.parse(await res.json()).connections).toEqual([]);
  });
});

describe("changing and deleting", () => {
  test("its owner changes a query, and a blank description removes it", async () => {
    const viewer = await signedInAs("viewer");
    const saved = await save(viewer.cookie, { description: "old" });

    const res = await request(
      `/api/saved-queries/${saved.id}`,
      json({ name: "Renamed", sql: "select 2", description: "" }, viewer.cookie, "PATCH"),
    );

    expect(res.status).toBe(200);
    const changed = savedQuery.parse(await res.json());
    expect(changed).toMatchObject({ name: "Renamed", sql: "select 2", description: null });
    expect(Date.parse(changed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(saved.updatedAt));
  });

  test("how it's shown can be changed, and a chart's kind goes when it's no longer one", async () => {
    const saved = await save(admin.cookie, { display: { type: "chart", kind: "bar" } });
    const change = async (body: unknown) => {
      const res = await request(
        `/api/saved-queries/${saved.id}`,
        json(body, admin.cookie, "PATCH"),
      );
      expect(res.status).toBe(200);
      return savedQuery.parse(await res.json()).display;
    };

    // A change to something else keeps how it's shown.
    expect(await change({ name: "Renamed" })).toEqual({ type: "chart", kind: "bar" });
    expect(await change({ display: { type: "table" } })).toEqual({ type: "table" });
    expect(await change({ display: { type: "chart", kind: "area" } })).toEqual({
      type: "chart",
      kind: "area",
    });
    await change({ display: { type: "number" } });
    expect(
      await db.orm.public.SavedQuery.select("display", "chartKind").first({ id: saved.id }),
    ).toEqual({ display: "number", chartKind: null });
  });

  test("its connections can be changed", async () => {
    const saved = await save(admin.cookie);

    const res = await request(
      `/api/saved-queries/${saved.id}`,
      json({ connectionIds: [hidden.id] }, admin.cookie, "PATCH"),
    );

    expect(savedQuery.parse(await res.json()).connections).toEqual([
      { id: hidden.id, name: hidden.name },
    ]);
  });

  test("an editor changes and deletes anyone's global query; a viewer can't", async () => {
    const owner = await signedInAs("editor");
    const editor = await signedInAs("editor");
    const viewer = await signedInAs("viewer");
    const saved = await save(owner.cookie, { scope: "global" });

    const byViewer = await request(
      `/api/saved-queries/${saved.id}`,
      json({ name: "Nope" }, viewer.cookie, "PATCH"),
    );
    const deleteByViewer = await request(`/api/saved-queries/${saved.id}`, {
      method: "DELETE",
      headers: { cookie: viewer.cookie },
    });
    const viewerSees = (await list(viewer.cookie)).find((q) => q.id === saved.id);
    const byEditor = await request(
      `/api/saved-queries/${saved.id}`,
      json({ name: "Better name" }, editor.cookie, "PATCH"),
    );

    expect(byViewer.status).toBe(403);
    expect(deleteByViewer.status).toBe(403);
    expect(viewerSees?.canEdit).toBe(false);
    expect(byEditor.status).toBe(200);
    expect(savedQuery.parse(await byEditor.json()).name).toBe("Better name");

    const deleted = await request(`/api/saved-queries/${saved.id}`, {
      method: "DELETE",
      headers: { cookie: editor.cookie },
    });
    expect(deleted.status).toBe(204);
    expect((await list(owner.cookie)).map((q) => q.id)).not.toContain(saved.id);
  });

  test("only its owner changes who sees a query, and a viewer can't share it", async () => {
    const owner = await signedInAs("editor");
    const editor = await signedInAs("editor");
    const viewer = await signedInAs("viewer");
    const shared = await save(owner.cookie, { scope: "global" });
    const viewers = await save(viewer.cookie);

    const byEditor = await request(
      `/api/saved-queries/${shared.id}`,
      json({ scope: "personal" }, editor.cookie, "PATCH"),
    );
    const byViewer = await request(
      `/api/saved-queries/${viewers.id}`,
      json({ scope: "global" }, viewer.cookie, "PATCH"),
    );
    const byOwner = await request(
      `/api/saved-queries/${shared.id}`,
      json({ scope: "personal" }, owner.cookie, "PATCH"),
    );

    expect(byEditor.status).toBe(403);
    expect(await errorOf(byEditor)).toContain("who sees it");
    expect(byViewer.status).toBe(403);
    expect(byOwner.status).toBe(200);
    expect((await list(editor.cookie)).map((q) => q.id)).not.toContain(shared.id);
  });

  test("someone else's personal query is missing to them", async () => {
    const owner = await signedInAs("viewer");
    const other = await signedInAs("editor");
    const saved = await save(owner.cookie);

    const res = await request(
      `/api/saved-queries/${saved.id}`,
      json({ name: "Mine now" }, other.cookie, "PATCH"),
    );

    expect(res.status).toBe(404);
  });
});

describe("what goes with what", () => {
  test("deleting a connection takes it out of its saved queries", async () => {
    const doomed = await addConnection(true);
    const saved = await save(admin.cookie, { connectionIds: [doomed.id] });

    await request(`/api/connections/${doomed.id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });
    const res = await request(`/api/saved-queries/${saved.id}`, {
      headers: { cookie: admin.cookie },
    });

    expect(savedQuery.parse(await res.json()).connections).toEqual([]);
  });

  test("deleting a user deletes their personal queries and keeps their global ones", async () => {
    const leaving = await signedInAs("editor");
    const personal = await save(leaving.cookie);
    const shared = await save(leaving.cookie, { scope: "global" });

    const res = await request(`/api/users/${leaving.id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(res.status).toBe(204);
    expect(await db.orm.public.SavedQuery.select("id").first({ id: personal.id })).toBeNull();
    const kept = (await list(admin.cookie)).find((q) => q.id === shared.id);
    expect(kept?.owner).toBeNull();
  });
});
