import { expect, test } from "bun:test";

import { runQueryRequest } from "@pg_select1/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";

import { connections, queryRows, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const shop = connections.find((c) => c.name === "shop");

test("picks a database, runs a query on it and shows its rows", async () => {
  const asked: { id: string; body: unknown }[] = [];
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ params, request }) => {
      const body: unknown = await request.json();
      asked.push({ id: String(params.id), body });
      return HttpResponse.json(queryRows);
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore");

  await user.click(await screen.findByRole("combobox", { name: "Database" }));
  await user.click(await screen.findByRole("option", { name: "shop" }));
  expect(window.location.search).toBe("?connection=shop");
  expect(screen.getByRole("button", { name: "Run" })).toHaveProperty("disabled", true);
  await user.type(screen.getByRole("textbox", { name: "SQL" }), "select * from customers");
  await user.click(screen.getByRole("button", { name: "Run" }));

  const grid = await screen.findByRole("table", { name: "Result" });
  expect(asked).toHaveLength(1);
  expect(asked[0]?.id).toBe(shop?.id ?? "");
  // Parsing checks the run's id is a UUID, as the API does.
  expect(runQueryRequest.parse(asked[0]?.body).sql).toBe("select * from customers");
  expect(screen.getByText("3 rows in 12 ms")).toBeDefined();
  const headers = within(grid)
    .getAllByRole("columnheader")
    .map((th) => th.textContent);
  expect(headers).toEqual([
    "idbigint",
    "emailtext",
    "namecharacter varying(80)",
    "created_attimestamp with time zone",
  ]);
  const alan = within(grid).getByText("alan@example.com").closest("tr");
  expect(within(alan!).getByText("NULL")).toBeDefined();
});

test("runs select * from a table picked with no SQL written", async () => {
  const asked: string[] = [];
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      asked.push(runQueryRequest.parse(await request.json()).sql);
      return HttpResponse.json(queryRows);
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  expect(within(tables).getByText("reporting")).toBeDefined();
  await user.click(within(tables).getByRole("button", { name: "customers" }));

  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "SQL" }).value).toBe(
    "select * from public.customers",
  );
  expect(asked).toEqual(["select * from public.customers"]);
});

test("clears the SQL and the result, so picking a table runs select * from it again", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  const sql = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "SQL" });
  expect(screen.getByRole("button", { name: "Clear" })).toHaveProperty("disabled", true);
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(sql.value).toBe("");
  expect(document.activeElement).toBe(sql);
  expect(screen.queryByRole("table", { name: "Result" })).toBeNull();
  expect(screen.queryByText("3 rows in 12 ms")).toBeNull();
  expect(screen.getByRole("button", { name: "Clear" })).toHaveProperty("disabled", true);
  await user.click(within(tables).getByRole("button", { name: "orders" }));
  expect(sql.value).toBe("select * from public.orders");
  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
});

test("writes a table's name in the SQL where the cursor is, once some is written", async () => {
  const asked: string[] = [];
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      asked.push(runQueryRequest.parse(await request.json()).sql);
      return HttpResponse.json(queryRows);
    }),
    http.get("/api/explore/connections/:id/tables", () =>
      HttpResponse.json({
        tables: [
          { schema: "public", name: "customers", kind: "table" },
          { schema: "Sales", name: 'odd "name"', kind: "view" },
        ],
      }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  const sql = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "SQL" });
  await user.type(sql, "select * from  limit 10");
  sql.setSelectionRange(14, 14);
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  expect(sql.value).toBe("select * from public.customers limit 10");

  await user.click(within(tables).getByRole("button", { name: 'odd "name"' }));
  expect(sql.value).toBe('select * from public.customers"Sales"."odd ""name""" limit 10');
  expect(asked).toEqual([]);
});

test("runs with Ctrl or ⌘ and Enter", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.keyboard("{Control>}{Enter}{/Control}");

  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
});

test("says when there are more rows than it shows, or none", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({ ...queryRows, truncated: true }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("The first 1,000 rows in 12 ms; there are more.")).toBeDefined();

  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({ ...queryRows, columns: [], rows: [] }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("The statement ran in 12 ms and returns no rows.")).toBeDefined();
  expect(screen.queryByRole("table", { name: "Result" })).toBeNull();
});

test("says why a query failed", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({ error: 'syntax error at or near "selec"' }, { status: 502 }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "selec 1");
  await user.click(screen.getByRole("button", { name: "Run" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    'Couldn\'t run the query: syntax error at or near "selec"',
  );
});

test("keeps the last result on screen while the next query runs", async () => {
  const { promise: answered, resolve: answer } = Promise.withResolvers<undefined>();
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("3 rows in 12 ms")).toBeDefined();
  server.use(
    http.post("/api/explore/connections/:id/query", async () => {
      await answered;
      return HttpResponse.json({ ...queryRows, rows: queryRows.rows.slice(0, 1) });
    }),
  );
  await user.click(screen.getByRole("button", { name: "Run" }));

  expect(await screen.findByText("Running…")).toBeDefined();
  expect(screen.getByRole("table", { name: "Result" })).toBeDefined();
  expect(screen.getByText("3 rows in 12 ms")).toBeDefined();
  answer(undefined);
  expect(await screen.findByText("1 row in 12 ms")).toBeDefined();
  expect(screen.queryByText("Running…")).toBeNull();
});

test("cancels a running query", async () => {
  const cancelled: string[] = [];
  let runId = "";
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      runId = runQueryRequest.parse(await request.json()).runId ?? "";
      await delay("infinite");
      return HttpResponse.json(queryRows);
    }),
    http.post("/api/explore/queries/:runId/cancel", ({ params }) => {
      cancelled.push(String(params.runId));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select pg_sleep(60)");
  await user.click(screen.getByRole("button", { name: "Run" }));
  await user.click(await screen.findByRole("button", { name: "Cancel" }));

  expect(await screen.findByText("The query was cancelled.")).toBeDefined();
  expect(cancelled).toEqual([runId]);
  expect(screen.getByRole("button", { name: "Run" })).toBeDefined();
});

test("with only one database, it's picked already", async () => {
  server.use(
    http.get("/api/explore/connections", () =>
      HttpResponse.json({ connections: [{ id: shop?.id, name: shop?.name }] }),
    ),
  );
  renderApp("/explore");

  expect(await screen.findByRole("navigation", { name: "Tables" })).toBeDefined();
});

test("says when there's nothing to explore, and where to add a database for an admin", async () => {
  server.use(http.get("/api/explore/connections", () => HttpResponse.json({ connections: [] })));
  const user = userEvent.setup();
  renderApp("/explore");

  await user.click(await screen.findByRole("link", { name: "Add a connection" }));
  expect(await screen.findByRole("heading", { name: "Connections" })).toBeDefined();
});

test("tells someone who isn't an admin who adds databases", async () => {
  server.use(
    http.get("/api/me", () => HttpResponse.json(viewer)),
    http.get("/api/explore/connections", () => HttpResponse.json({ connections: [] })),
  );
  renderApp("/explore");

  expect(
    await screen.findByText(
      "No databases to explore yet. Connections an admin makes visible will be here.",
    ),
  ).toBeDefined();
});

test("opens in place of the query page it replaced, on the same database", async () => {
  renderApp("/query?connection=shop");

  expect(await screen.findByRole("heading", { name: "Explore" })).toBeDefined();
  expect(window.location.pathname + window.location.search).toBe("/explore?connection=shop");
});

test("is in the header for everyone", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  const user = userEvent.setup();
  renderApp("/profile");

  const nav = await screen.findByRole("navigation", { name: "Main" });
  await user.click(within(nav).getByRole("link", { name: "Explore" }));

  expect(await screen.findByRole("heading", { name: "Explore" })).toBeDefined();
  expect(within(nav).getByRole("link", { name: "Explore" }).getAttribute("aria-current")).toBe(
    "page",
  );
});
