import { describe, expect, test } from "bun:test";

import {
  connection,
  errorResponse,
  explorableConnectionList,
  tableRows,
  targetTableList,
} from "@pg_select1/shared";
import { Client } from "pg";

import { request, signedInAs } from "../../../test/api";
import { ROW_CAP } from "./service";

// A database of its own in the test run's Postgres, as a target to explore, read by a role that
// owns it, as a connection's role often does, so only the transaction keeps it read-only.
const url = new URL(process.env.DATABASE_URL ?? "");
const password = `pw-${crypto.randomUUID()}`;
const target = {
  host: url.hostname,
  port: Number(url.port),
  database: "explore_target",
  username: "explore_reader",
  password,
  sslMode: "disable",
};

const superuser = new Client({ connectionString: url.toString() });
await superuser.connect();
await superuser.query(`CREATE ROLE explore_reader LOGIN PASSWORD '${password}'`);
await superuser.query("CREATE DATABASE explore_target OWNER explore_reader");
await superuser.end();

const owner = new Client({ ...target, user: target.username });
await owner.connect();
await owner.query(`
  CREATE SCHEMA shop;
  CREATE TABLE shop.products (id int8 PRIMARY KEY, name varchar(80), price numeric(10, 2),
    added_at timestamptz, details jsonb, photo bytea);
  INSERT INTO shop.products VALUES
    (1, 'Kettle', 24.50, '2026-01-02 03:04:05+00', '{"color": "red"}', '\\x0102'),
    (2, NULL, NULL, NULL, NULL, NULL);
  CREATE VIEW shop.cheap AS SELECT id, name FROM shop.products WHERE price < 10;
  CREATE TABLE public.events (id int, at date) PARTITION BY RANGE (at);
  CREATE TABLE public.events_2026 PARTITION OF public.events
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
  CREATE TABLE public.many AS SELECT n FROM generate_series(1, ${ROW_CAP + 5}) AS n;
  CREATE TABLE public."Odd ""name""" ("a b" text);
  INSERT INTO public."Odd ""name""" VALUES ('quoted');

  -- Reading this view writes, which a read-only transaction refuses.
  CREATE TABLE public.writes (n int);
  CREATE FUNCTION public.write_one() RETURNS int LANGUAGE plpgsql AS
    $$ BEGIN INSERT INTO public.writes VALUES (1); RETURN 1; END $$;
  CREATE VIEW public.sneaky AS SELECT public.write_one() AS n;
`);
await owner.end();

let names = 0;
function uniqueName(): string {
  names += 1;
  return `explore${names}_${crypto.randomUUID().slice(0, 8)}`;
}

async function addConnection(visible: boolean, overrides: Record<string, unknown> = {}) {
  const admin = await signedInAs("admin");
  const res = await request("/api/connections", {
    method: "POST",
    body: JSON.stringify({ name: uniqueName(), ...target, visible, ...overrides }),
    headers: { cookie: admin.cookie },
  });
  expect(res.status).toBe(201);
  return connection.parse(await res.json());
}

function get(path: string, cookie: string): Promise<Response> {
  return request(path, { headers: { cookie } });
}

function rowsPath(id: string, schema: string, table: string): string {
  const query = new URLSearchParams({ schema, table });
  return `/api/explore/connections/${id}/rows?${query.toString()}`;
}

describe("which connections someone can explore", () => {
  test("an admin sees hidden connections too, anyone else only the visible ones", async () => {
    const visible = await addConnection(true);
    const hidden = await addConnection(false);
    const admin = await signedInAs("admin");
    const viewer = await signedInAs("viewer");

    const forAdmin = await get("/api/explore/connections", admin.cookie);
    const forViewer = await get("/api/explore/connections", viewer.cookie);

    const adminNames = explorableConnectionList
      .parse(await forAdmin.json())
      .connections.map((c) => c.name);
    const viewerList = await forViewer.text();
    const viewerNames = explorableConnectionList
      .parse(JSON.parse(viewerList))
      .connections.map((c) => c.name);
    expect(adminNames).toContain(visible.name);
    expect(adminNames).toContain(hidden.name);
    expect(viewerNames).toContain(visible.name);
    expect(viewerNames).not.toContain(hidden.name);
    // Only names: where a database is and who connects to it are for admins.
    expect(viewerList).not.toContain(target.username);
  });

  test("a hidden connection's tables and rows answer 404 to anyone but an admin", async () => {
    const hidden = await addConnection(false);
    const viewer = await signedInAs("viewer");

    const tables = await get(`/api/explore/connections/${hidden.id}/tables`, viewer.cookie);
    const rows = await get(rowsPath(hidden.id, "shop", "products"), viewer.cookie);

    expect(tables.status).toBe(404);
    expect(rows.status).toBe(404);
  });

  test("nobody signed in explores nothing", async () => {
    const visible = await addConnection(true);

    expect((await request("/api/explore/connections")).status).toBe(401);
    expect((await request(`/api/explore/connections/${visible.id}/tables`)).status).toBe(401);
  });
});

describe("tables", () => {
  test("lists tables and views by schema, without Postgres's own or partitions", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await get(`/api/explore/connections/${visible.id}/tables`, viewer.cookie);

    expect(res.status).toBe(200);
    const { tables } = targetTableList.parse(await res.json());
    expect(tables).toEqual([
      { schema: "public", name: 'Odd "name"', kind: "table" },
      { schema: "public", name: "events", kind: "partitioned table" },
      { schema: "public", name: "many", kind: "table" },
      { schema: "public", name: "sneaky", kind: "view" },
      { schema: "public", name: "writes", kind: "table" },
      { schema: "shop", name: "cheap", kind: "view" },
      { schema: "shop", name: "products", kind: "table" },
    ]);
  });

  test("a database that can't be reached says why to an admin", async () => {
    const unreachable = await addConnection(true, { host: "127.0.0.1", port: 1 });
    const admin = await signedInAs("admin");

    const res = await get(`/api/explore/connections/${unreachable.id}/tables`, admin.cookie);

    expect(res.status).toBe(502);
    expect(errorResponse.parse(await res.json()).error).toBe(
      "Nothing is accepting connections at 127.0.0.1:1",
    );
  });

  test("anyone else isn't told where the database is or who connects to it", async () => {
    const unreachable = await addConnection(true, { host: "127.0.0.1", port: 1 });
    const refused = await addConnection(true, { password: "not the password" });
    const viewer = await signedInAs("viewer");

    for (const c of [unreachable, refused]) {
      const res = await get(`/api/explore/connections/${c.id}/tables`, viewer.cookie);

      expect(res.status).toBe(502);
      expect(errorResponse.parse(await res.json()).error).toBe(
        `${c.name} can't be reached right now. An admin can test its connection.`,
      );
    }
  });
});

describe("rows", () => {
  test("answers a table's columns with their types, and every value as Postgres prints it", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await get(rowsPath(visible.id, "shop", "products"), viewer.cookie);

    expect(res.status).toBe(200);
    const body = tableRows.parse(await res.json());
    expect(body.columns).toEqual([
      { name: "id", type: "bigint" },
      { name: "name", type: "character varying(80)" },
      { name: "price", type: "numeric(10,2)" },
      { name: "added_at", type: "timestamp with time zone" },
      { name: "details", type: "jsonb" },
      { name: "photo", type: "bytea" },
    ]);
    expect(body.rows).toContainEqual([
      "1",
      "Kettle",
      "24.50",
      "2026-01-02 03:04:05+00",
      '{"color": "red"}',
      "\\x0102",
    ]);
    expect(body.rows).toContainEqual(["2", null, null, null, null, null]);
    expect(body.truncated).toBe(false);
  });

  test("a view with no rows still has its columns", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await get(rowsPath(visible.id, "shop", "cheap"), viewer.cookie);

    expect(tableRows.parse(await res.json())).toMatchObject({
      columns: [
        { name: "id", type: "bigint" },
        { name: "name", type: "character varying(80)" },
      ],
      rows: [],
      truncated: false,
    });
  });

  test("names that need quoting are quoted", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await get(rowsPath(visible.id, "public", 'Odd "name"'), viewer.cookie);

    expect(tableRows.parse(await res.json())).toMatchObject({
      columns: [{ name: "a b", type: "text" }],
      rows: [["quoted"]],
    });
  });

  test(`stops at ${ROW_CAP} rows and says there are more`, async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await get(rowsPath(visible.id, "public", "many"), viewer.cookie);

    const body = tableRows.parse(await res.json());
    expect(body.rows).toHaveLength(ROW_CAP);
    expect(body.truncated).toBe(true);
    expect(body.rowCap).toBe(ROW_CAP);
  });

  test("reads in a read-only transaction, even as a role that could write", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await get(rowsPath(visible.id, "public", "sneaky"), viewer.cookie);

    expect(res.status).toBe(502);
    expect(errorResponse.parse(await res.json()).error).toBe(
      "cannot execute INSERT in a read-only transaction",
    );
  });

  test("a table that isn't there, or isn't named, says so", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const missing = await get(rowsPath(visible.id, "shop", "nope"), viewer.cookie);
    const unnamed = await get(
      `/api/explore/connections/${visible.id}/rows?schema=shop`,
      viewer.cookie,
    );

    expect(missing.status).toBe(404);
    expect(errorResponse.parse(await missing.json()).error).toBe("There's no table shop.nope");
    expect(unnamed.status).toBe(400);
  });

  test("a connection's new settings take effect on its next read", async () => {
    const visible = await addConnection(true);
    const admin = await signedInAs("admin");
    expect((await get(rowsPath(visible.id, "shop", "products"), admin.cookie)).status).toBe(200);

    await request(`/api/connections/${visible.id}`, {
      method: "PATCH",
      body: JSON.stringify({ password: "not the password" }),
      headers: { cookie: admin.cookie },
    });
    const res = await get(rowsPath(visible.id, "shop", "products"), admin.cookie);

    expect(res.status).toBe(502);
    expect(errorResponse.parse(await res.json()).error).toBe(
      'password authentication failed for user "explore_reader"',
    );
  });
});
