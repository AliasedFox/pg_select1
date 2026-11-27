import { expect, test } from "bun:test";

import { EditorView } from "@codemirror/view";
import {
  createSavedQueryRequest,
  runQueryRequest,
  updateSavedQueryRequest,
} from "@pg_select1/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";

import { connections, queryRows, savedQueries, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { SETTLE_MS } from "./history";

const shop = connections.find((c) => c.name === "shop");

// The SQL in the editor, which is CodeMirror's, so there's no textarea to read the value of.
function sqlOf(editor: HTMLElement): string {
  return EditorView.findFromDOM(editor)?.state.doc.toString() ?? "";
}

// The SQL with its selection in it as `[` and `]`, or its cursor as `|`.
function selectionOf(editor: HTMLElement): string {
  const state = EditorView.findFromDOM(editor)?.state;
  if (!state) return "";
  const { from, to } = state.selection.main;
  const doc = state.doc.toString();
  return from === to
    ? `${doc.slice(0, from)}|${doc.slice(from)}`
    : `${doc.slice(0, from)}[${doc.slice(from, to)}]${doc.slice(to)}`;
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

test("runs select * from a table clicked, in place of the SQL written", async () => {
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
  await user.click(within(tables).getByRole("button", { name: "customers" }));

  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
  expect(sqlOf(sql)).toBe('select * from "public"."customers"');
  expect(asked).toEqual(['select * from "public"."customers"']);
});

test("clears the SQL and the result", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  const sql = screen.getByRole("textbox", { name: "SQL" });
  expect(screen.getByRole("button", { name: "Clear" })).toHaveProperty("disabled", true);
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(sqlOf(sql)).toBe("");
  expect(document.activeElement).toBe(sql);
  expect(screen.queryByRole("table", { name: "Result" })).toBeNull();
  expect(screen.queryByText("3 rows in 12 ms")).toBeNull();
  expect(screen.getByRole("button", { name: "Clear" })).toHaveProperty("disabled", true);
});

test("keeps a version of the SQL once typing stops, not one for each key", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await screen.findByRole("navigation", { name: "Tables" });
  const history = screen.getByRole("button", { name: "History" });
  expect(history).toHaveProperty("disabled", true);
  await user.type(screen.getByRole("textbox", { name: "SQL" }), "select 1");
  await waitFor(
    () => {
      expect(history).toHaveProperty("disabled", false);
    },
    { timeout: SETTLE_MS * 2 },
  );

  await user.click(history);
  const versions = within(await screen.findByRole("list", { name: "Versions" }));
  expect(
    versions.getAllByRole("listitem").map((li) => li.querySelector("pre")?.textContent),
  ).toEqual(["select 1"]);
  expect(versions.getByText("current")).toBeDefined();
});

test("restores an earlier version of the SQL from the history, keeping the one replaced", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  const sql = screen.getByRole("textbox", { name: "SQL" });
  await user.type(sql, "select 1");
  // Replacing the SQL keeps what was typed at once, without waiting for it to settle.
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "History" }));
  const versions = within(await screen.findByRole("list", { name: "Versions" }));
  expect(
    versions.getAllByRole("listitem").map((li) => li.querySelector("pre")?.textContent),
  ).toEqual(['select * from "public"."customers"', "select 1"]);
  const restores = versions.getAllByRole("button", { name: /^Restore/ });
  expect(restores[0]).toHaveProperty("disabled", true);
  await user.click(restores[1]!);

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(sqlOf(sql)).toBe("select 1");
  // Compared as a boolean: a failing toBe on two elements prints the whole DOM.
  await waitFor(() => {
    expect(document.activeElement === sql).toBe(true);
  });
});

test("copies a table's name with its schema, quoted, without running it", async () => {
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
  await user.click(within(tables).getByRole("button", { name: "Copy customers" }));
  expect(await navigator.clipboard.readText()).toBe('"public"."customers"');
  expect(within(tables).getByRole("button", { name: "Copied" })).toBeDefined();

  await user.click(within(tables).getByRole("button", { name: 'Copy odd "name"' }));
  expect(await navigator.clipboard.readText()).toBe('"Sales"."odd ""name"""');

  // A keyword like `user` works as a name too.
  await user.click(within(tables).getByRole("button", { name: "Copy order" }));
  expect(await navigator.clipboard.readText()).toBe('"user"."order"');
  expect(sqlOf(screen.getByRole("textbox", { name: "SQL" }))).toBe("");
  expect(asked).toEqual([]);
});

test("shows a table's name whole in a tooltip when it doesn't fit", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  const tables = await screen.findByRole("navigation", { name: "Tables" });
  await user.hover(within(tables).getByText("orders"));
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(screen.queryByRole("tooltip")).toBeNull();

  // jsdom lays nothing out, so the name is made wider than it's shown.
  const customers = within(tables).getByText("customers");
  Object.defineProperty(customers, "scrollWidth", { value: 300 });
  Object.defineProperty(customers, "clientWidth", { value: 100 });
  await user.hover(customers);
  expect((await screen.findByRole("tooltip", {}, { timeout: 2000 })).textContent).toBe("customers");
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
  // The button is only there once the pointer has come over its cell.
  expect(within(alan!).queryByRole("button")).toBeNull();
  await user.hover(alan!);
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

  const sql = await screen.findByRole("textbox", { name: "SQL" });
  await user.type(sql, "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  const grid = await screen.findByRole("table", { name: "Result" });
  await user.click(within(grid).getByRole("button", { name: "Sort by created_at" }));
  await user.click(await screen.findByRole("menuitem", { name: 'order by "created_at" desc' }));

  expect(await navigator.clipboard.readText()).toBe('order by "created_at" desc');
  expect(within(grid).getByRole("button", { name: "Copied" }).textContent).toBe("Copied");

  // The cursor goes back in the SQL, on a new line at its end, to paste it there.
  await waitFor(() => {
    expect(document.activeElement).toBe(sql);
  });
  expect(selectionOf(sql)).toBe("select 1\n|");
  await user.keyboard('order by "id"');

  // An order by on the last line already is selected, to replace it.
  await user.click(within(grid).getByRole("button", { name: "Sort by email" }));
  await user.click(await screen.findByRole("menuitem", { name: 'order by "email" asc' }));
  await waitFor(() => {
    expect(document.activeElement).toBe(sql);
  });
  expect(selectionOf(sql)).toBe('select 1\n[order by "id"]');
});

test("copies a where on a column, of those that fit its type", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  const grid = await screen.findByRole("table", { name: "Result" });
  await user.click(within(grid).getByRole("button", { name: "Filter by email" }));
  // Text has text searches, which a number doesn't.
  await user.click(await screen.findByRole("menuitem", { name: /contains/ }));

  expect(await navigator.clipboard.readText()).toBe(`where "email" ilike '%value%'`);
  expect(within(grid).getByRole("button", { name: "Copied" }).textContent).toBe("Copied");

  // The cursor goes back in the SQL, at the end of its first line, after a space.
  const sql = screen.getByRole("textbox", { name: "SQL" });
  await waitFor(() => {
    expect(document.activeElement).toBe(sql);
  });
  expect(selectionOf(sql)).toBe("select 1 |");

  await user.click(within(grid).getByRole("button", { name: "Filter by id" }));
  expect(await screen.findByRole("menuitem", { name: /between/ })).toBeDefined();
  expect(screen.queryByRole("menuitem", { name: /contains/ })).toBeNull();
});

test("copies an and instead when the SQL has a where already", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1 where true");
  await user.click(screen.getByRole("button", { name: "Run" }));
  const grid = await screen.findByRole("table", { name: "Result" });
  await user.click(within(grid).getByRole("button", { name: "Filter by email" }));
  await user.click(await screen.findByRole("menuitem", { name: /contains/ }));

  expect(await navigator.clipboard.readText()).toBe(`and "email" ilike '%value%'`);
});

test("copies a query that counts each group of a column, of those that fit its type", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select * from customers");
  await user.click(screen.getByRole("button", { name: "Run" }));
  const grid = await screen.findByRole("table", { name: "Result" });
  await user.click(within(grid).getByRole("button", { name: "Group by created_at" }));
  // A timestamp groups by its day, which text doesn't.
  await user.click(await screen.findByRole("menuitem", { name: /by day/ }));

  expect(await navigator.clipboard.readText()).toBe(
    [
      `select date_trunc('day', "created_at") as "created_at", count(*)`,
      "from customers",
      "group by 1",
      "order by 1",
    ].join("\n"),
  );
  expect(within(grid).getByRole("button", { name: "Copied" }).textContent).toBe("Copied");

  // Focus goes back to the SQL, all of it selected, for the query to replace it.
  const sql = screen.getByRole("textbox", { name: "SQL" });
  await waitFor(() => {
    expect(document.activeElement).toBe(sql);
  });
  expect(selectionOf(sql)).toBe("[select * from customers]");

  await user.click(within(grid).getByRole("button", { name: "Group by email" }));
  expect(await screen.findByRole("menuitem", { name: /ignoring case/ })).toBeDefined();
  expect(screen.queryByRole("menuitem", { name: /by day/ })).toBeNull();
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

test("saves the SQL as a personal query on the database picked, and keeps it open", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/saved-queries", async ({ request }) => {
      const body = createSavedQueryRequest.parse(await request.json());
      sent = body;
      return HttpResponse.json(
        {
          ...savedQueries[1],
          id: "0199a1b2-0000-7000-8000-0000000000a9",
          name: body.name,
          sql: body.sql,
          scope: body.scope,
        },
        { status: 201 },
      );
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Save…" }));
  const form = within(await screen.findByRole("form", { name: "Save query" }));
  await user.type(form.getByLabelText("Name"), "One");
  await user.click(form.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("heading", { name: "One" })).toBeDefined();
  expect(window.location.search).toBe(
    "?connection=shop&query=0199a1b2-0000-7000-8000-0000000000a9",
  );
  expect(sent).toEqual({
    name: "One",
    description: null,
    sql: "select 1",
    scope: "personal",
    connectionIds: [shop?.id],
    display: { type: "table" },
  });
  expect(screen.getByText("Saved.")).toBeDefined();
  // Nothing has changed since.
  expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
});

test("a viewer can't share a query with everyone", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Save…" }));

  const form = within(await screen.findByRole("form", { name: "Save query" }));
  expect(form.getByRole("switch", { name: "Share with everyone" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(form.getByText(/Only editors and admins can share/)).toBeDefined();
});

test("saves changes over the saved query open, or as a new one", async () => {
  const daily = savedQueries[0]!;
  let sent: unknown;
  server.use(
    http.patch("/api/saved-queries/:id", async ({ request }) => {
      const changes = updateSavedQueryRequest.parse(await request.json());
      sent = changes;
      return HttpResponse.json({ ...daily, sql: changes.sql });
    }),
  );
  const user = userEvent.setup();
  renderApp(`/explore?query=${daily.id}`);

  const editor = await screen.findByRole("textbox", { name: "SQL" });
  await waitFor(() => {
    expect(sqlOf(editor)).toBe(daily.sql);
  });
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Save as…" })).toBeDefined();
  // Typing goes in where the cursor is, at the start.
  await user.type(editor, "explain ");
  await user.click(save);

  expect(await screen.findByText("Saved.")).toBeDefined();
  expect(sent).toEqual({
    sql: `explain ${daily.sql}`,
    connectionIds: [shop?.id],
    display: { type: "table" },
  });
});

test("a saved query its user can't change is saved as a new one only", async () => {
  const daily = { ...savedQueries[0]!, canEdit: false };
  server.use(http.get("/api/saved-queries/:id", () => HttpResponse.json(daily)));
  renderApp(`/explore?query=${daily.id}`);

  expect(await screen.findByText(/save it as yours instead/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.getByRole("button", { name: "Save as…" })).toBeDefined();
});

test("Clear closes the saved query open", async () => {
  const daily = savedQueries[0]!;
  const user = userEvent.setup();
  renderApp(`/explore?connection=shop&query=${daily.id}`);

  await screen.findByRole("heading", { name: "Daily signups" });
  await user.click(screen.getByRole("button", { name: "Clear" }));

  expect(window.location.search).toBe("?connection=shop");
  expect(screen.queryByRole("heading", { name: "Daily signups" })).toBeNull();
  expect(sqlOf(screen.getByRole("textbox", { name: "SQL" }))).toBe("");
});

test("says so when the saved query asked for isn't there", async () => {
  renderApp("/explore?connection=shop&query=0199a1b2-0000-7000-8000-0000000000ff");

  expect(await screen.findByText(/Couldn't open the saved query: There's no such/)).toBeDefined();
});

test("runs a saved query as it opens, once, on its database", async () => {
  const daily = savedQueries[0]!;
  const asked: { id: string; sql: string }[] = [];
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ params, request }) => {
      asked.push({ id: String(params.id), sql: runQueryRequest.parse(await request.json()).sql });
      return HttpResponse.json(queryRows);
    }),
  );
  renderApp(`/explore?query=${daily.id}`);

  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
  expect(asked).toEqual([{ id: shop?.id ?? "", sql: daily.sql }]);
});

test("doesn't run a saved query whose database is gone on the one picked instead", async () => {
  const unpaid = savedQueries[2]!;
  let runs = 0;
  server.use(
    http.post("/api/explore/connections/:id/query", () => {
      runs += 1;
      return HttpResponse.json(queryRows);
    }),
  );
  const user = userEvent.setup();
  renderApp(`/explore?query=${unpaid.id}`);

  await screen.findByRole("heading", { name: "Unpaid invoices" });
  await user.click(screen.getByRole("combobox", { name: "Database" }));
  await user.click(await screen.findByRole("option", { name: "shop" }));

  expect(window.location.search).toBe(`?connection=shop&query=${unpaid.id}`);
  expect(screen.getByRole("button", { name: "Run" })).toHaveProperty("disabled", false);
  expect(runs).toBe(0);
});

test("picks the first database, by name, when none is in the address", async () => {
  const asked: string[] = [];
  server.use(
    http.get("/api/explore/connections/:id/tables", ({ params }) => {
      asked.push(String(params.id));
      return HttpResponse.json({ tables: [] });
    }),
  );
  renderApp("/explore");

  const select = await screen.findByRole("combobox", { name: "Database" });
  await waitFor(() => {
    expect(select.textContent).toContain("billing");
  });
  expect(asked).toEqual([connections.find((c) => c.name === "billing")?.id ?? ""]);
  expect(window.location.search).toBe("");
});

test("waits for a saved query to say its database before picking the first", async () => {
  const daily = savedQueries[0]!;
  const asked: string[] = [];
  server.use(
    http.get("/api/explore/connections/:id/tables", ({ params }) => {
      asked.push(String(params.id));
      return HttpResponse.json({ tables: [] });
    }),
  );
  renderApp(`/explore?query=${daily.id}`);

  await screen.findByRole("heading", { name: "Daily signups" });
  await waitFor(() => {
    expect(asked).toEqual([shop?.id ?? ""]);
  });
});

// Orders by their status, counted.
const ordersByStatus = {
  columns: [
    { name: "status", type: "text" },
    { name: "orders", type: "bigint" },
  ],
  rows: [
    ["paid", "12"],
    ["refunded", "3"],
    ["pending", "5"],
  ],
  truncated: false,
  rowCap: 200,
  durationMs: 4,
};

test("charts a result as bars, its columns read from their order, with none to pick", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () => HttpResponse.json(ordersByStatus)),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  await screen.findByRole("table", { name: "Result" });
  const toggle = screen.getByRole("group", { name: "View" });
  expect(within(toggle).getByRole("button", { name: "Table" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  await user.click(within(toggle).getByRole("button", { name: "Chart" }));

  const chart = await screen.findByRole("figure", { name: "Result chart" });
  expect(screen.queryByRole("table", { name: "Result" })).toBeNull();
  expect(within(chart).queryByRole("combobox")).toBeNull();

  // Still a chart for the next run.
  await user.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => {
    expect(screen.getByText("3 rows in 4 ms")).toBeDefined();
  });
  expect(screen.getByRole("figure", { name: "Result chart" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Table" }));
  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
});

test("charts a result as a line, an area or a pie, and keeps the kind for the next run", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () => HttpResponse.json(ordersByStatus)),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  await screen.findByRole("table", { name: "Result" });
  await user.click(screen.getByRole("button", { name: "Chart" }));
  const chart = await screen.findByRole("figure", { name: "Result chart" });
  const kinds = within(chart).getByRole("group", { name: "Chart" });
  // The toggle's found again each time, since a run draws a new chart.
  const pressed = () =>
    within(screen.getByRole("group", { name: "Chart" }))
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true")
      .map((button) => button.getAttribute("aria-label"));
  expect(
    within(kinds)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Bar", "Line", "Area", "Pie"]);
  expect(pressed()).toEqual(["Bar"]);
  await user.click(within(kinds).getByRole("button", { name: "Line" }));
  expect(pressed()).toEqual(["Line"]);
  await user.click(within(kinds).getByRole("button", { name: "Pie" }));

  // A pie lists its slices, the largest first, with their share.
  const slices = within(chart).getByRole("list", { name: "Slices" });
  expect(
    within(slices)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["paid1260%", "pending525%", "refunded315%"]);

  await user.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => {
    expect(screen.getByText("3 rows in 4 ms")).toBeDefined();
  });
  expect(pressed()).toEqual(["Pie"]);
});

test("says when there's no column of numbers after the first to chart", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  await screen.findByRole("table", { name: "Result" });
  await user.click(screen.getByRole("button", { name: "Chart" }));
  // The customers have no column of numbers but their id, the first.
  expect(await screen.findByText(/There's no column of numbers after the first/)).toBeDefined();

  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({
        ...ordersByStatus,
        columns: [
          { name: "day", type: "date" },
          ordersByStatus.columns[0],
          { name: "total", type: "numeric" },
        ],
        rows: [["2026-11-26", "paid", "120.50"]],
      }),
    ),
  );
  // A column of names after the first splits the numbers into series instead.
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByRole("figure", { name: "Result chart" })).toBeDefined();
});

test("shows a result as the number in its first row's first column, and keeps it for the next run", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({
        ...ordersByStatus,
        columns: [
          { name: "revenue", type: "numeric" },
          { name: "orders", type: "bigint" },
        ],
        rows: [
          ["1234567.50", "20"],
          ["8", "9"],
        ],
      }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  await screen.findByRole("table", { name: "Result" });
  await user.click(screen.getByRole("button", { name: "Number" }));

  const number = await screen.findByRole("figure", { name: "Result number" });
  expect(screen.queryByRole("table", { name: "Result" })).toBeNull();
  expect(number.textContent).toBe("revenue1,234,567.50");

  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({ ...ordersByStatus, rows: [] }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByText("There's no row to show a number of.")).toBeDefined();
});

test("shows a table clicked in the grid, whatever the last result was switched to", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () => HttpResponse.json(ordersByStatus)),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  await screen.findByRole("table", { name: "Result" });
  await user.click(screen.getByRole("button", { name: "Chart" }));
  await screen.findByRole("figure", { name: "Result chart" });

  const tables = screen.getByRole("navigation", { name: "Tables" });
  await user.click(within(tables).getByRole("button", { name: "customers" }));
  expect(await screen.findByRole("table", { name: "Result" })).toBeDefined();
  expect(screen.queryByRole("figure", { name: "Result chart" })).toBeNull();
  expect(screen.getByRole("button", { name: "Table" }).getAttribute("aria-pressed")).toBe("true");
});

test("opens a saved query shown as it was saved, and saves how it's shown", async () => {
  const daily = {
    ...savedQueries[0]!,
    display: { type: "chart", kind: "pie" } as const,
  };
  const sent: unknown[] = [];
  server.use(
    http.get("/api/saved-queries/:id", () => HttpResponse.json(daily)),
    http.post("/api/explore/connections/:id/query", () => HttpResponse.json(ordersByStatus)),
    http.patch("/api/saved-queries/:id", async ({ request }) => {
      const changes = updateSavedQueryRequest.parse(await request.json());
      sent.push(changes.display);
      return HttpResponse.json({ ...daily, ...changes });
    }),
  );
  const user = userEvent.setup();
  renderApp(`/explore?query=${daily.id}`);

  const chart = await screen.findByRole("figure", { name: "Result chart" });
  expect(within(chart).getByRole("button", { name: "Pie" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toHaveProperty("disabled", true);

  // A chart of another kind is a change to save.
  await user.click(within(chart).getByRole("button", { name: "Bar" }));
  expect(save).toHaveProperty("disabled", false);
  await user.click(save);
  await screen.findByText("Saved.");
  await user.click(screen.getByRole("button", { name: "Number" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(sent).toHaveLength(2);
  });
  expect(sent).toEqual([{ type: "chart", kind: "bar" }, { type: "number" }]);
});

test("saves a new query shown as its result is, with the chart's kind", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/explore/connections/:id/query", () => HttpResponse.json(ordersByStatus)),
    http.post("/api/saved-queries", async ({ request }) => {
      sent = createSavedQueryRequest.parse(await request.json()).display;
      return HttpResponse.json(
        { ...savedQueries[1], id: "0199a1b2-0000-7000-8000-0000000000a9" },
        { status: 201 },
      );
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore?connection=shop");

  await user.type(await screen.findByRole("textbox", { name: "SQL" }), "select 1");
  await user.click(screen.getByRole("button", { name: "Run" }));
  await user.click(await screen.findByRole("button", { name: "Chart" }));
  await user.click(await screen.findByRole("button", { name: "Line" }));
  await user.click(screen.getByRole("button", { name: "Save…" }));
  const form = within(await screen.findByRole("form", { name: "Save query" }));
  await user.type(form.getByLabelText("Name"), "By status");
  await user.click(form.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(sent).toBeDefined();
  });
  expect(sent).toEqual({ type: "chart", kind: "line" });
});
