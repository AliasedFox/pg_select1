import { describe, expect, test } from "bun:test";

import {
  connection,
  errorResponse,
  explorableConnectionList,
  queryResult,
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

function runQuery(id: string, sql: unknown, cookie: string, runId?: string) {
  return request(`/api/explore/connections/${id}/query`, {
    method: "POST",
    body: JSON.stringify({ sql, runId }),
    headers: { cookie },
  });
}

function cancel(runId: string, cookie: string) {
  return request(`/api/explore/queries/${runId}/cancel`, { method: "POST", headers: { cookie } });
}

// Whether a statement is running on the target now, as its pg_stat_activity shows.
async function isRunning(query: string): Promise<boolean> {
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT 1 FROM pg_stat_activity WHERE datname = 'explore_target' AND state = 'active' AND query = $1",
      [query],
    );
    return rows.length > 0;
  } finally {
    await client.end();
  }
}

async function eventually(check: () => Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 50; tries += 1) {
    if (await check()) return;
    await Bun.sleep(100);
  }
  throw new Error("It didn't happen within 5 seconds");
}

describe("queries", () => {
  test("answers a statement's columns with their types, and its rows as Postgres prints them", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await runQuery(
      visible.id,
      "select id, name, price, added_at, 1 + 1 as two, null::text as nothing from shop.products order by id",
      viewer.cookie,
    );

    expect(res.status).toBe(200);
    const body = queryResult.parse(await res.json());
    expect(body.columns).toEqual([
      { name: "id", type: "bigint" },
      { name: "name", type: "character varying(80)" },
      { name: "price", type: "numeric(10,2)" },
      { name: "added_at", type: "timestamp with time zone" },
      { name: "two", type: "integer" },
      { name: "nothing", type: "text" },
    ]);
    expect(body.rows).toEqual([
      ["1", "Kettle", "24.50", "2026-01-02 03:04:05+00", "2", null],
      ["2", null, null, null, "2", null],
    ]);
    expect(body.truncated).toBe(false);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("columns of the same name are all there", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await runQuery(visible.id, "select 1, 'a'", viewer.cookie);

    expect(queryResult.parse(await res.json())).toMatchObject({
      columns: [
        { name: "?column?", type: "integer" },
        { name: "?column?", type: "text" },
      ],
      rows: [["1", "a"]],
    });
  });

  test("a statement that returns no rows answers no columns", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await runQuery(visible.id, "set local work_mem = '8MB'", viewer.cookie);

    expect(res.status).toBe(200);
    expect(queryResult.parse(await res.json())).toMatchObject({ columns: [], rows: [] });
  });

  test(`stops at ${ROW_CAP} rows and says there are more`, async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await runQuery(
      visible.id,
      "select * from generate_series(1, 1000000)",
      viewer.cookie,
    );

    const body = queryResult.parse(await res.json());
    expect(body.rows).toHaveLength(ROW_CAP);
    expect(body.truncated).toBe(true);
  });

  test("runs in a read-only transaction, even as a role that could write", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const insert = await runQuery(
      visible.id,
      "insert into public.writes values (1)",
      viewer.cookie,
    );
    const sneaky = await runQuery(visible.id, "select * from public.sneaky", viewer.cookie);

    expect(insert.status).toBe(502);
    expect(errorResponse.parse(await insert.json()).error).toBe(
      "cannot execute INSERT in a read-only transaction",
    );
    expect(errorResponse.parse(await sneaky.json()).error).toBe(
      "cannot execute INSERT in a read-only transaction",
    );
  });

  test("runs one statement at a time", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const res = await runQuery(
      visible.id,
      "set transaction read write; insert into public.writes values (1)",
      viewer.cookie,
    );

    expect(res.status).toBe(400);
    expect(errorResponse.parse(await res.json()).error).toBe("Run one statement at a time");
  });

  test("says what's wrong with the SQL", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");

    const typo = await runQuery(visible.id, "selec 1", viewer.cookie);
    const empty = await runQuery(visible.id, "  \n ", viewer.cookie);
    const comment = await runQuery(visible.id, "-- nothing", viewer.cookie);

    expect(typo.status).toBe(502);
    expect(errorResponse.parse(await typo.json()).error).toBe('syntax error at or near "selec"');
    expect(empty.status).toBe(400);
    expect(errorResponse.parse(await empty.json()).error).toBe("sql: Write a query");
    expect(comment.status).toBe(200);
    expect(queryResult.parse(await comment.json())).toMatchObject({ columns: [], rows: [] });
  });

  test("a hidden connection answers 404 to anyone but an admin", async () => {
    const hidden = await addConnection(false);
    const viewer = await signedInAs("viewer");
    const admin = await signedInAs("admin");

    expect((await runQuery(hidden.id, "select 1", viewer.cookie)).status).toBe(404);
    expect((await runQuery(hidden.id, "select 1", admin.cookie)).status).toBe(200);
  });

  test("cancels a running query on the database", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");
    const sql = "select pg_sleep(20) as slept";
    const runId = crypto.randomUUID();

    const run = runQuery(visible.id, sql, viewer.cookie, runId);
    await eventually(() => isRunning(sql));
    const again = await runQuery(visible.id, "select 1", viewer.cookie, runId);
    const cancelled = await cancel(runId, viewer.cookie);
    const res = await run;

    expect(again.status).toBe(409);
    expect(cancelled.status).toBe(204);
    expect(res.status).toBe(499);
    expect(errorResponse.parse(await res.json()).error).toBe("The query was cancelled");
    expect(await isRunning(sql)).toBe(false);
    // The connection's pool still answers after, and the id can be used again.
    expect((await runQuery(visible.id, "select 1", viewer.cookie, runId)).status).toBe(200);
  });

  test("nobody cancels someone else's query", async () => {
    const visible = await addConnection(true);
    const viewer = await signedInAs("viewer");
    const other = await signedInAs("viewer");
    const sql = "select pg_sleep(0.5) as napped";
    const runId = crypto.randomUUID();

    const run = runQuery(visible.id, sql, viewer.cookie, runId);
    await eventually(() => isRunning(sql));
    expect((await cancel(runId, other.cookie)).status).toBe(204);

    expect((await run).status).toBe(200);
  });
});
