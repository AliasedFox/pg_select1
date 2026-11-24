import { expect, test } from "bun:test";

import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { connections, customerRows, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const shop = connections.find((c) => c.name === "shop");

test("picks a database, then a table, and shows its rows", async () => {
  const asked: string[] = [];
  server.use(
    http.get("/api/explore/connections/:id/rows", ({ params, request }) => {
      asked.push(`${String(params.id)} ${new URL(request.url).search}`);
      return HttpResponse.json(customerRows);
    }),
  );
  const user = userEvent.setup();
  renderApp("/explore");

  await user.click(await screen.findByRole("combobox", { name: "Database" }));
  await user.click(await screen.findByRole("option", { name: "shop" }));
  const tables = await screen.findByRole("navigation", { name: "Tables" });
  expect(window.location.search).toBe("?connection=shop");
  expect(within(tables).getByText("reporting")).toBeDefined();
  await user.click(within(tables).getByRole("link", { name: "customers" }));

  const grid = await screen.findByRole("table", { name: "public.customers" });
  expect(window.location.search).toBe("?connection=shop&schema=public&table=customers");
  expect(asked).toEqual([`${shop?.id} ?schema=public&table=customers`]);
  expect(within(tables).getByRole("link", { name: "customers" }).getAttribute("aria-current")).toBe(
    "page",
  );
  expect(screen.getByText("3 rows")).toBeDefined();
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

test("opens the table in the address, and goes back to the one before", async () => {
  const user = userEvent.setup();
  renderApp("/explore?connection=shop&schema=public&table=customers");

  expect(await screen.findByRole("table", { name: "public.customers" })).toBeDefined();
  const tables = await screen.findByRole("navigation", { name: "Tables" });
  await user.click(within(tables).getByRole("link", { name: "orders" }));
  expect(await screen.findByRole("table", { name: "public.orders" })).toBeDefined();

  // The browser's back button, whose popstate comes after the call.
  await act(async () => {
    const popped = new Promise((resolve) => {
      window.addEventListener("popstate", resolve, { once: true });
    });
    window.history.back();
    await popped;
  });
  expect(await screen.findByRole("table", { name: "public.customers" })).toBeDefined();
});

test("says when there are more rows than it shows", async () => {
  server.use(
    http.get("/api/explore/connections/:id/rows", () =>
      HttpResponse.json({ ...customerRows, truncated: true }),
    ),
  );
  renderApp("/explore?connection=shop&schema=public&table=customers");

  expect(await screen.findByText("The first 1,000 rows; there are more.")).toBeDefined();
});

test("says why a table couldn't be read", async () => {
  server.use(
    http.get("/api/explore/connections/:id/rows", () =>
      HttpResponse.json({ error: "permission denied for table orders" }, { status: 502 }),
    ),
  );
  renderApp("/explore?connection=shop&schema=public&table=orders");

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Couldn't read public.orders: permission denied for table orders",
  );
});

test("with only one database, it's picked already", async () => {
  server.use(
    http.get("/api/explore/connections", () =>
      HttpResponse.json({ connections: [{ id: shop?.id, name: shop?.name }] }),
    ),
  );
  renderApp("/explore");

  expect(await screen.findByRole("navigation", { name: "Tables" })).toBeDefined();
  expect(screen.getByText("Choose a table to see its rows.")).toBeDefined();
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
