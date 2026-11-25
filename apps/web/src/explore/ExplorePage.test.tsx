import { expect, test } from "bun:test";

import { EditorView } from "@codemirror/view";
import { runQueryRequest } from "@pg_select1/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";

import { connections, queryRows, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const shop = connections.find((c) => c.name === "shop");

// The SQL in the editor, which is CodeMirror's, so there's no textarea to read the value of.
function sqlOf(editor: HTMLElement): string {
  return EditorView.findFromDOM(editor)?.state.doc.toString() ?? "";
}

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

test("runs select * from a table ⌘ or Ctrl-clicked, in place of the SQL written", async () => {
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
  const sql = screen.getByRole("textbox", { name: "SQL" });
  await user.type(sql, "select 1");
  const customers = within(tables).getByRole("button", { name: "customers" });
  expect(customers.classList.contains("cursor-pointer")).toBe(false);
  await user.keyboard("{Control>}");
  // Holding it shows a click would open the table.
  expect(customers.classList.contains("cursor-pointer")).toBe(true);
  await user.click(customers);
  await user.keyboard("{/Control}");
  expect(customers.classList.contains("cursor-pointer")).toBe(false);

  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
  expect(sqlOf(sql)).toBe('select * from "public"."customers"');
  expect(asked).toEqual(['select * from "public"."customers"']);
  expect(screen.getByText("Ctrl-click to show all")).toBeDefined();
});

test("clears the SQL and the result", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  const sql = screen.getByRole("textbox", { name: "SQL" });
  expect(screen.getByRole("button", { name: "Clear" })).toHaveProperty("disabled", true);
  await user.keyboard("{Control>}");
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  await user.keyboard("{/Control}");
  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(sqlOf(sql)).toBe("");
  expect(document.activeElement).toBe(sql);
  expect(screen.queryByRole("table", { name: "Result" })).toBeNull();
  expect(screen.queryByText("3 rows in 12 ms")).toBeNull();
  expect(screen.getByRole("button", { name: "Clear" })).toHaveProperty("disabled", true);
});

test("writes a clicked table's name in the SQL where the cursor is, without running it", async () => {
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
          { schema: "user", name: "order", kind: "table" },
        ],
      }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  const sql = screen.getByRole("textbox", { name: "SQL" });
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  expect(sqlOf(sql)).toBe('"public"."customers"');

  const editor = EditorView.findFromDOM(sql);
  editor?.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: "select * from  limit 10" },
    selection: { anchor: 14 },
  });
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  expect(sqlOf(sql)).toBe('select * from "public"."customers" limit 10');

  await user.click(within(tables).getByRole("button", { name: 'odd "name"' }));
  expect(sqlOf(sql)).toBe('select * from "public"."customers""Sales"."odd ""name""" limit 10');

  // A keyword like `user` works as a name too.
  editor?.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "" } });
  await user.click(within(tables).getByRole("button", { name: "order" }));
  expect(sqlOf(sql)).toBe('"user"."order"');
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
  // The rows come as a page with more, and the page after it fails, so it stays at the first.
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      const { offset } = runQueryRequest.parse(await request.json());
      return offset
        ? HttpResponse.json({ error: "The database didn't answer" }, { status: 502 })
        : HttpResponse.json({ ...queryRows, truncated: true });
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("The first 3 rows in 12 ms; scroll for more.")).toBeDefined();

  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({ ...queryRows, columns: [], rows: [] }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("The statement ran in 12 ms and returns no rows.")).toBeDefined();
  expect(screen.queryByRole("table", { name: "Result" })).toBeNull();
});

// A page of `count` rows of one column, `n`, numbered from `from`.
function numbers(from: number, count: number, truncated: boolean) {
  return {
    columns: [{ name: "n", type: "integer" }],
    rows: Array.from({ length: count }, (_, i) => [String(from + i)]),
    truncated,
    rowCap: 200,
    durationMs: 12,
  };
}

test("reads the next page of rows as the window comes near the last, from the SQL that was run", async () => {
  const asked: { sql: string; offset?: number }[] = [];
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      const { sql, offset } = runQueryRequest.parse(await request.json());
      asked.push({ sql, offset });
      if (!offset) return HttpResponse.json(numbers(1, 200, true));
      return HttpResponse.json(numbers(offset + 1, 20, false));
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const sql = await screen.findByRole("textbox", { name: "SQL" });
  await user.type(sql, "select n from numbers");
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("The first 200 rows in 12 ms; scroll for more.")).toBeDefined();
  expect(asked).toHaveLength(1);

  // What the editor holds now isn't what the next page reads.
  await user.type(sql, " where false");
  window.scrollTo(0, 200 * 32);
  window.dispatchEvent(new Event("scroll"));

  expect(await screen.findByText("220 rows in 12 ms")).toBeDefined();
  expect(asked).toEqual([
    { sql: "select n from numbers", offset: undefined },
    { sql: "select n from numbers", offset: 200 },
  ]);
});

test("says when the next page of rows couldn't be read, and reads it again when asked", async () => {
  let fail = true;
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      const { offset } = runQueryRequest.parse(await request.json());
      if (!offset) return HttpResponse.json(numbers(1, 3, true));
      if (fail) return HttpResponse.json({ error: "Too slow" }, { status: 504 });
      return HttpResponse.json(numbers(4, 2, false));
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));

  expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load more rows: Too slow");
  fail = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("5 rows in 12 ms")).toBeDefined();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("copies a value from its cell", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  const grid = await screen.findByRole("table", { name: "Result" });
  const alan = within(grid).getByText("alan@example.com").closest("td");
  await user.click(within(alan!).getByRole("button", { name: "Copy" }));

  expect(await navigator.clipboard.readText()).toBe("alan@example.com");
  expect(within(alan!).getByRole("button", { name: "Copied" })).toBeDefined();
  // NULL has nothing to copy.
  const nameless = within(grid).getByText("NULL").closest("td");
  expect(within(nameless!).queryByRole("button")).toBeNull();
});

test("copies an order by on a column, to paste in the SQL", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  const grid = await screen.findByRole("table", { name: "Result" });
  await user.click(within(grid).getByRole("button", { name: "Sort by created_at" }));
  await user.click(await screen.findByRole("menuitem", { name: 'order by "created_at" desc' }));

  expect(await navigator.clipboard.readText()).toBe('order by "created_at" desc');
  expect(within(grid).getByRole("button", { name: "Copied" }).textContent).toBe("Copied");
});

test("shows a value whole in a tooltip when it doesn't fit in one line", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({ ...queryRows, rows: [["1", "a@example.com", "two\nlines", null]] }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  const grid = await screen.findByRole("table", { name: "Result" });

  await user.hover(within(grid).getByText("a@example.com"));
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(screen.queryByRole("tooltip")).toBeNull();

  await user.hover(within(grid).getByText(/two/));
  expect((await screen.findByRole("tooltip", {}, { timeout: 2000 })).textContent).toBe(
    "two\nlines",
  );
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
