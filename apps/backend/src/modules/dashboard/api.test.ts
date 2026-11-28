import { describe, expect, test } from "bun:test";

import {
  connection,
  type Dashboard,
  dashboard,
  dashboardList,
  errorResponse,
  MAX_DASHBOARD_ITEMS,
  savedQuery,
} from "@pg_select1/shared";

import { request, signedInAs } from "../../../test/api";
import { db } from "../../db";

function json(body: unknown, cookie: string, method = "POST"): RequestInit {
  return { method, body: JSON.stringify(body), headers: { cookie } };
}

const url = new URL(process.env.DATABASE_URL ?? "");
const admin = await signedInAs("admin");

const shopRes = await request(
  "/api/connections",
  json(
    {
      name: `dash_${crypto.randomUUID().slice(0, 8)}`,
      host: url.hostname,
      port: Number(url.port),
      database: url.pathname.slice(1),
      username: "nobody",
      sslMode: "disable",
      visible: true,
    },
    admin.cookie,
  ),
);
const shop = connection.parse(await shopRes.json());

async function saveQuery(cookie: string, overrides: Record<string, unknown> = {}) {
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

async function make(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await request(
    "/api/dashboards",
    json({ name: `Dashboard ${crypto.randomUUID().slice(0, 8)}`, ...overrides }, cookie),
  );
  expect(res.status).toBe(201);
  return dashboard.parse(await res.json());
}

async function get(id: string, cookie: string) {
  return request(`/api/dashboards/${id}`, { headers: { cookie } });
}

async function list(cookie: string) {
  const res = await request("/api/dashboards", { headers: { cookie } });
  expect(res.status).toBe(200);
  return dashboardList.parse(await res.json()).dashboards;
}

function itemsOf(...ids: string[]) {
  return ids.map((savedQueryId) => ({ savedQueryId }));
}

// What's on a dashboard: each query's id, and each title as `title: <text>`.
function contents({ items }: Dashboard) {
  return items.map((item) => (item.kind === "query" ? item.savedQueryId : `title: ${item.title}`));
}

// The saved queries on a dashboard, as the caller sees them.
function queriesOn({ items }: Dashboard) {
  return items.flatMap((item) => (item.kind === "query" ? [item.savedQuery] : []));
}

async function patch(id: string, body: unknown, cookie: string) {
  return request(`/api/dashboards/${id}`, json(body, cookie, "PATCH"));
}

async function errorOf(res: Response) {
  return errorResponse.parse(await res.json()).error;
}

describe("making", () => {
  test("answers 401 to nobody", async () => {
    expect((await request("/api/dashboards")).status).toBe(401);
  });

  test("a dashboard is personal unless shared, with its queries in the order given", async () => {
    const viewer = await signedInAs("viewer");
    const first = await saveQuery(viewer.cookie);
    const second = await saveQuery(viewer.cookie);

    const made = await make(viewer.cookie, {
      name: "  Signups ",
      description: "",
      items: itemsOf(second.id, first.id),
    });

    expect(made).toMatchObject({
      name: "Signups",
      description: null,
      scope: "personal",
      itemCount: 2,
      owner: { id: viewer.id },
      canEdit: true,
    });
    expect(contents(made)).toEqual([second.id, first.id]);
    expect(queriesOn(made)[0]).toMatchObject({ id: second.id, sql: "select 1" });
  });

  test("a query on a dashboard is shown as the query says", async () => {
    const editor = await signedInAs("editor");
    const display = { type: "chart", kind: "pie" } as const;
    const charted = await saveQuery(editor.cookie, { display });
    const plain = await saveQuery(editor.cookie);

    const made = await make(editor.cookie, { items: itemsOf(charted.id, plain.id) });

    expect(queriesOn(made).map((query) => query?.display)).toEqual([display, { type: "table" }]);
  });

  test("titles go between a dashboard's queries, which they don't count among", async () => {
    const editor = await signedInAs("editor");
    const query = await saveQuery(editor.cookie);

    const made = await make(editor.cookie, {
      items: [{ title: " Signups " }, { savedQueryId: query.id }, { title: "Revenue" }],
    });

    expect(contents(made)).toEqual(["title: Signups", query.id, "title: Revenue"]);
    expect(made.itemCount).toBe(1);
    expect((await list(editor.cookie)).find((d) => d.id === made.id)?.itemCount).toBe(1);
  });

  test("a dashboard needs a title, and at most so many queries and titles", async () => {
    const editor = await signedInAs("editor");
    const query = await saveQuery(editor.cookie);
    const tries = [
      { name: " " },
      {
        name: "D",
        items: Array.from({ length: MAX_DASHBOARD_ITEMS + 1 }, () => ({ title: "T" })),
      },
      { name: "D", items: [{ savedQueryId: "not-a-uuid" }] },
      { name: "D", items: [{ title: " " }] },
      { name: "D", items: [{}] },
      { name: "D", items: [{ savedQueryId: query.id, title: "T" }] },
      { name: "D", refreshMinutes: 7 },
    ];

    for (const body of tries) {
      const res = await request("/api/dashboards", json(body, editor.cookie));
      expect(res.status).toBe(400);
    }
  });

  test("a viewer can't share a dashboard with everyone, but an editor can", async () => {
    const viewer = await signedInAs("viewer");
    const editor = await signedInAs("editor");

    const refused = await request(
      "/api/dashboards",
      json({ name: "D", scope: "global" }, viewer.cookie),
    );
    const shared = await make(editor.cookie, { scope: "global" });

    expect(refused.status).toBe(403);
    expect(shared.scope).toBe("global");
  });

  test("only queries its maker sees go on a dashboard", async () => {
    const owner = await signedInAs("editor");
    const other = await signedInAs("editor");
    const theirs = await saveQuery(other.cookie);

    const res = await request(
      "/api/dashboards",
      json({ name: "D", items: itemsOf(theirs.id) }, owner.cookie),
    );

    expect(res.status).toBe(404);
    expect(await errorOf(res)).toBe("There's no such saved query");
  });
});

describe("who sees what", () => {
  test("a personal dashboard is its owner's alone; a global one everyone's, by name", async () => {
    const owner = await signedInAs("editor");
    const other = await signedInAs("viewer");
    const mine = await make(owner.cookie, { name: "b mine" });
    const shared = await make(owner.cookie, { name: "a shared", scope: "global" });

    const ownerIds = (await list(owner.cookie)).map((d) => d.id);
    const otherIds = (await list(other.cookie)).map((d) => d.id);
    const adminIds = (await list(admin.cookie)).map((d) => d.id);

    expect(ownerIds.indexOf(shared.id)).toBeLessThan(ownerIds.indexOf(mine.id));
    expect(otherIds).toContain(shared.id);
    expect(otherIds).not.toContain(mine.id);
    // Not even an admin sees someone else's personal dashboard.
    expect(adminIds).not.toContain(mine.id);
    expect((await get(mine.id, admin.cookie)).status).toBe(404);
  });

  test("someone else's personal query on a global dashboard is there, but not to see", async () => {
    const owner = await signedInAs("editor");
    const viewer = await signedInAs("viewer");
    const personal = await saveQuery(owner.cookie);
    const shared = await saveQuery(owner.cookie, { scope: "global" });
    const made = await make(owner.cookie, {
      scope: "global",
      items: itemsOf(personal.id, shared.id),
    });

    const seen = dashboard.parse(await (await get(made.id, viewer.cookie)).json());

    expect(contents(seen)).toEqual([personal.id, shared.id]);
    expect(queriesOn(seen).map((query) => query?.id ?? null)).toEqual([null, shared.id]);
  });
});

describe("changing and deleting", () => {
  test("its owner changes a dashboard, and a blank description removes it", async () => {
    const viewer = await signedInAs("viewer");
    const made = await make(viewer.cookie, { description: "old" });

    const res = await request(
      `/api/dashboards/${made.id}`,
      json({ name: "Renamed", description: "" }, viewer.cookie, "PATCH"),
    );

    expect(res.status).toBe(200);
    const changed = dashboard.parse(await res.json());
    expect(changed).toMatchObject({ name: "Renamed", description: null });
    expect(Date.parse(changed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(made.updatedAt));
  });

  test("its queries are added, moved and removed by replacing them", async () => {
    const editor = await signedInAs("editor");
    const [a, b, c] = await Promise.all([
      saveQuery(editor.cookie),
      saveQuery(editor.cookie),
      saveQuery(editor.cookie),
    ]);
    const made = await make(editor.cookie, { items: itemsOf(a.id, b.id) });

    const res = await request(
      `/api/dashboards/${made.id}`,
      json({ items: itemsOf(c.id, a.id) }, editor.cookie, "PATCH"),
    );

    const changed = dashboard.parse(await res.json());
    expect(contents(changed)).toEqual([c.id, a.id]);
    expect(changed.itemCount).toBe(2);
  });

  test("a query goes on a dashboard once", async () => {
    const editor = await signedInAs("editor");
    const [a, b] = await Promise.all([saveQuery(editor.cookie), saveQuery(editor.cookie)]);
    const made = await make(editor.cookie, { items: itemsOf(a.id) });

    const twiceAtFirst = await request(
      "/api/dashboards",
      json({ name: "D", items: itemsOf(a.id, a.id) }, editor.cookie),
    );
    const addedAgain = await patch(made.id, { items: itemsOf(a.id, b.id, a.id) }, editor.cookie);

    expect(twiceAtFirst.status).toBe(400);
    expect(addedAgain.status).toBe(400);
    expect(await errorOf(addedAgain)).toBe("That query is on the dashboard already");
  });

  test("a dashboard that had a query twice before keeps it, but gets no third", async () => {
    const editor = await signedInAs("editor");
    const [a, b] = await Promise.all([saveQuery(editor.cookie), saveQuery(editor.cookie)]);
    const made = await make(editor.cookie, { items: itemsOf(a.id, b.id) });
    await db.orm.public.DashboardItem.create({
      dashboardId: made.id,
      savedQueryId: a.id,
      title: null,
      position: 2,
    });

    const moved = await patch(made.id, { items: itemsOf(a.id, a.id, b.id) }, editor.cookie);
    const third = await patch(made.id, { items: itemsOf(a.id, a.id, a.id) }, editor.cookie);

    expect(moved.status).toBe(200);
    expect(contents(dashboard.parse(await moved.json()))).toEqual([a.id, a.id, b.id]);
    expect(third.status).toBe(400);
  });

  test("a dashboard runs its queries again only when asked, unless it says how often", async () => {
    const viewer = await signedInAs("viewer");
    const made = await make(viewer.cookie);

    const every5 = await patch(made.id, { refreshMinutes: 5 }, viewer.cookie);
    const renamed = await patch(made.id, { name: "Renamed" }, viewer.cookie);
    const odd = await patch(made.id, { refreshMinutes: 7 }, viewer.cookie);
    const off = await patch(made.id, { refreshMinutes: null }, viewer.cookie);

    expect(made.refreshMinutes).toBeNull();
    expect(dashboard.parse(await every5.json()).refreshMinutes).toBe(5);
    expect(dashboard.parse(await renamed.json()).refreshMinutes).toBe(5);
    expect(odd.status).toBe(400);
    expect(dashboard.parse(await off.json()).refreshMinutes).toBeNull();
  });

  test("an editor keeps someone else's personal query on a dashboard they change", async () => {
    const owner = await signedInAs("editor");
    const editor = await signedInAs("editor");
    const personal = await saveQuery(owner.cookie);
    const shared = await saveQuery(editor.cookie, { scope: "global" });
    const made = await make(owner.cookie, { scope: "global", items: itemsOf(personal.id) });

    const res = await request(
      `/api/dashboards/${made.id}`,
      json({ items: itemsOf(shared.id, personal.id) }, editor.cookie, "PATCH"),
    );

    expect(res.status).toBe(200);
    const changed = dashboard.parse(await res.json());
    expect(contents(changed)).toEqual([shared.id, personal.id]);
  });

  test("an editor changes and deletes anyone's global dashboard; a viewer can't", async () => {
    const owner = await signedInAs("editor");
    const editor = await signedInAs("editor");
    const viewer = await signedInAs("viewer");
    const made = await make(owner.cookie, { scope: "global" });

    const byViewer = await request(
      `/api/dashboards/${made.id}`,
      json({ name: "Nope" }, viewer.cookie, "PATCH"),
    );
    const deleteByViewer = await request(`/api/dashboards/${made.id}`, {
      method: "DELETE",
      headers: { cookie: viewer.cookie },
    });
    const viewerSees = (await list(viewer.cookie)).find((d) => d.id === made.id);
    const byEditor = await request(
      `/api/dashboards/${made.id}`,
      json({ name: "Better name" }, editor.cookie, "PATCH"),
    );

    expect(byViewer.status).toBe(403);
    expect(deleteByViewer.status).toBe(403);
    expect(viewerSees?.canEdit).toBe(false);
    expect(byEditor.status).toBe(200);
    expect(dashboard.parse(await byEditor.json()).name).toBe("Better name");

    const deleted = await request(`/api/dashboards/${made.id}`, {
      method: "DELETE",
      headers: { cookie: editor.cookie },
    });
    expect(deleted.status).toBe(204);
    expect((await list(owner.cookie)).map((d) => d.id)).not.toContain(made.id);
  });

  test("only its owner changes who sees a dashboard", async () => {
    const owner = await signedInAs("editor");
    const editor = await signedInAs("editor");
    const made = await make(owner.cookie, { scope: "global" });

    const byEditor = await request(
      `/api/dashboards/${made.id}`,
      json({ scope: "personal" }, editor.cookie, "PATCH"),
    );
    const byOwner = await request(
      `/api/dashboards/${made.id}`,
      json({ scope: "personal" }, owner.cookie, "PATCH"),
    );

    expect(byEditor.status).toBe(403);
    expect(await errorOf(byEditor)).toContain("who sees it");
    expect(byOwner.status).toBe(200);
    expect((await list(editor.cookie)).map((d) => d.id)).not.toContain(made.id);
  });
});

describe("what goes with what", () => {
  test("deleting a saved query takes it off its dashboards; deleting a dashboard keeps its queries", async () => {
    const editor = await signedInAs("editor");
    const doomed = await saveQuery(editor.cookie);
    const kept = await saveQuery(editor.cookie);
    const made = await make(editor.cookie, { items: itemsOf(doomed.id, kept.id) });

    await request(`/api/saved-queries/${doomed.id}`, {
      method: "DELETE",
      headers: { cookie: editor.cookie },
    });
    const after = dashboard.parse(await (await get(made.id, editor.cookie)).json());
    await request(`/api/dashboards/${made.id}`, {
      method: "DELETE",
      headers: { cookie: editor.cookie },
    });

    expect(contents(after)).toEqual([kept.id]);
    expect(await db.orm.public.SavedQuery.select("id").first({ id: kept.id })).not.toBeNull();
  });

  test("deleting a user deletes their personal dashboards and keeps their global ones", async () => {
    const leaving = await signedInAs("editor");
    const personal = await make(leaving.cookie);
    const shared = await make(leaving.cookie, { scope: "global" });

    const res = await request(`/api/users/${leaving.id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(res.status).toBe(204);
    expect(await db.orm.public.Dashboard.select("id").first({ id: personal.id })).toBeNull();
    const kept = (await list(admin.cookie)).find((d) => d.id === shared.id);
    expect(kept?.owner).toBeNull();
  });
});
