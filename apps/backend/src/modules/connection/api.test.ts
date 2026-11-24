import { describe, expect, test } from "bun:test";

import {
  connection,
  connectionList,
  errorResponse,
  testConnectionResult,
} from "@pg_select1/shared";
import { Client } from "pg";

import { request, signedInAs } from "../../../test/api";
import { db } from "../../db";

function json(body: unknown, cookie: string, method = "POST"): RequestInit {
  return { method, body: JSON.stringify(body), headers: { cookie } };
}

// The test run's own Postgres, pg_select1's database, is a target as good as any, with a role of
// its own whose password appears nowhere else, so a response holding it would show.
const url = new URL(process.env.DATABASE_URL ?? "");
const password = `pw-${crypto.randomUUID()}`;
const reachable = {
  host: url.hostname,
  port: Number(url.port),
  database: url.pathname.slice(1),
  username: "connection_tester",
  sslMode: "disable",
};
const superuser = new Client({ connectionString: url.toString() });
await superuser.connect();
await superuser.query(`CREATE ROLE connection_tester LOGIN PASSWORD '${password}'`);
await superuser.end();

let names = 0;
function uniqueName(): string {
  names += 1;
  return `conn${names}_${crypto.randomUUID().slice(0, 8)}`;
}

async function create(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await request(
    "/api/connections",
    json({ name: uniqueName(), ...reachable, password, ...overrides }, cookie),
  );
  expect(res.status).toBe(201);
  return connection.parse(await res.json());
}

async function runTest(path: string, body: unknown, cookie: string) {
  const res = await request(path, json(body, cookie));
  expect(res.status).toBe(200);
  return testConnectionResult.parse(await res.json());
}

describe("only admins manage connections", () => {
  test("listing answers 401 to nobody and 403 to an editor or viewer", async () => {
    const editor = await signedInAs("editor");
    const viewer = await signedInAs("viewer");

    expect((await request("/api/connections")).status).toBe(401);
    for (const { cookie } of [editor, viewer]) {
      expect((await request("/api/connections", { headers: { cookie } })).status).toBe(403);
    }
  });

  test("an editor can't add, change, delete or test one", async () => {
    const admin = await signedInAs("admin");
    const editor = await signedInAs("editor");
    const saved = await create(admin.cookie);

    const tries = [
      request("/api/connections", json({ name: uniqueName(), ...reachable }, editor.cookie)),
      request(`/api/connections/${saved.id}`, json({ visible: true }, editor.cookie, "PATCH")),
      request(`/api/connections/${saved.id}`, {
        method: "DELETE",
        headers: { cookie: editor.cookie },
      }),
      request(`/api/connections/${saved.id}/test`, json({}, editor.cookie)),
      request("/api/connections/test", json({ ...reachable, password }, editor.cookie)),
    ];

    for (const res of await Promise.all(tries)) expect(res.status).toBe(403);
  });
});

describe("adding", () => {
  test("an admin adds a connection, hidden until made visible, without its password in sight", async () => {
    const admin = await signedInAs("admin");
    const name = uniqueName();

    const res = await request(
      "/api/connections",
      json({ name, ...reachable, password }, admin.cookie),
    );

    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain(password);
    expect(connection.parse(JSON.parse(text))).toMatchObject({
      name,
      ...reachable,
      hasPassword: true,
      visible: false,
    });

    const listed = await request("/api/connections", { headers: { cookie: admin.cookie } });
    const listText = await listed.text();
    expect(listText).not.toContain(password);
    expect(connectionList.parse(JSON.parse(listText)).connections.map((c) => c.name)).toContain(
      name,
    );

    const row = await db.orm.public.Connection.select("encryptedPassword").first({ name });
    expect(row?.encryptedPassword).toStartWith("v1.");
    expect(row?.encryptedPassword).not.toContain(password);
  });

  test("a connection can have no password", async () => {
    const admin = await signedInAs("admin");

    const saved = await create(admin.cookie, { password: "" });

    expect(saved.hasPassword).toBe(false);
  });

  test("a name another connection has answers 409", async () => {
    const admin = await signedInAs("admin");
    const saved = await create(admin.cookie);

    const res = await request(
      "/api/connections",
      json({ ...reachable, name: saved.name }, admin.cookie),
    );

    expect(res.status).toBe(409);
  });

  test("a connection needs a name Postgres can prefix with, and a port", async () => {
    const admin = await signedInAs("admin");

    const badName = await request(
      "/api/connections",
      json({ ...reachable, name: "pg_shop" }, admin.cookie),
    );
    const badPort = await request(
      "/api/connections",
      json({ ...reachable, name: uniqueName(), port: 70_000 }, admin.cookie),
    );

    expect(badName.status).toBe(400);
    expect(errorResponse.parse(await badName.json()).error).toContain("pg_");
    expect(badPort.status).toBe(400);
  });
});

describe("changing and deleting", () => {
  test("an admin makes a connection visible and renames it", async () => {
    const admin = await signedInAs("admin");
    const saved = await create(admin.cookie);
    const name = uniqueName();

    const res = await request(
      `/api/connections/${saved.id}`,
      json({ name, visible: true }, admin.cookie, "PATCH"),
    );

    expect(res.status).toBe(200);
    expect(connection.parse(await res.json())).toMatchObject({
      id: saved.id,
      name,
      host: reachable.host,
      visible: true,
      hasPassword: true,
    });
  });

  test("a blank password keeps the saved one, and a new one replaces it", async () => {
    const admin = await signedInAs("admin");
    const saved = await create(admin.cookie);

    await request(`/api/connections/${saved.id}`, json({ password: "" }, admin.cookie, "PATCH"));
    expect((await runTest(`/api/connections/${saved.id}/test`, {}, admin.cookie)).ok).toBe(true);

    await request(
      `/api/connections/${saved.id}`,
      json({ password: "not the password" }, admin.cookie, "PATCH"),
    );
    expect((await runTest(`/api/connections/${saved.id}/test`, {}, admin.cookie)).ok).toBe(false);
  });

  test("renaming to another connection's name answers 409", async () => {
    const admin = await signedInAs("admin");
    const first = await create(admin.cookie);
    const second = await create(admin.cookie);

    const res = await request(
      `/api/connections/${second.id}`,
      json({ name: first.name }, admin.cookie, "PATCH"),
    );

    expect(res.status).toBe(409);
  });

  test("an admin deletes a connection", async () => {
    const admin = await signedInAs("admin");
    const saved = await create(admin.cookie);

    const res = await request(`/api/connections/${saved.id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(res.status).toBe(204);
    const again = await request(`/api/connections/${saved.id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });
    expect(again.status).toBe(404);
  });

  test("an unknown connection answers 404", async () => {
    const admin = await signedInAs("admin");

    const missing = await request(
      `/api/connections/${Bun.randomUUIDv7()}`,
      json({ visible: true }, admin.cookie, "PATCH"),
    );
    const notAnId = await request("/api/connections/nope/test", json({}, admin.cookie));

    expect(missing.status).toBe(404);
    expect(notAnId.status).toBe(400);
  });
});

describe("testing", () => {
  test("a saved connection answers the server's version", async () => {
    const admin = await signedInAs("admin");
    const saved = await create(admin.cookie);

    const result = await runTest(`/api/connections/${saved.id}/test`, {}, admin.cookie);

    expect(result.ok ? result.serverVersion : "").toMatch(/^17\./);
  });

  test("settings that aren't saved yet are tested as they are", async () => {
    const admin = await signedInAs("admin");

    const right = await runTest("/api/connections/test", { ...reachable, password }, admin.cookie);
    const wrong = await runTest(
      "/api/connections/test",
      { ...reachable, password: "not the password" },
      admin.cookie,
    );

    expect(right.ok).toBe(true);
    expect(wrong).toEqual({
      ok: false,
      error: `password authentication failed for user "${reachable.username}"`,
    });
  });

  test("without a password, a test uses the one saved for the connection being edited", async () => {
    const admin = await signedInAs("admin");
    const saved = await create(admin.cookie);

    const result = await runTest(
      "/api/connections/test",
      { ...reachable, connectionId: saved.id },
      admin.cookie,
    );

    expect(result.ok).toBe(true);
  });

  test("a port nothing listens on says so", async () => {
    const admin = await signedInAs("admin");

    const result = await runTest(
      "/api/connections/test",
      { ...reachable, host: "127.0.0.1", port: 1, password },
      admin.cookie,
    );

    expect(result).toEqual({ ok: false, error: "Nothing is accepting connections at 127.0.0.1:1" });
  });

  test("SSL on a server without it says how to fix it", async () => {
    const admin = await signedInAs("admin");

    const result = await runTest(
      "/api/connections/test",
      { ...reachable, sslMode: "require", password },
      admin.cookie,
    );

    expect(result).toEqual({
      ok: false,
      error: "The server does not support SSL connections: set SSL to disable",
    });
  });
});
