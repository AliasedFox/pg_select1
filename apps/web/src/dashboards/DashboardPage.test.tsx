import { expect, test } from "bun:test";

import { runQueryRequest, updateDashboardRequest } from "@pg_select1/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { dashboards, queryRows, savedQueries, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const [overview, weekly] = dashboards;
const [daily, open, unpaid] = savedQueries;

// Records each query the page runs, by its SQL.
function recordRuns(): string[] {
  const ran: string[] = [];
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      ran.push(runQueryRequest.parse(await request.json()).sql);
      return HttpResponse.json(queryRows);
    }),
  );
  return ran;
}

// Records what saving the dashboard's queries sends, answering the fake API's own way.
function recordSaves(): unknown[] {
  const sent: unknown[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "PATCH") return;
    void request
      .clone()
      .json()
      .then((body: unknown) => sent.push(updateDashboardRequest.parse(body)));
  });
  return sent;
}

function sectionTitles(): string[] {
  return screen.getAllByRole("region").map((section) => section.getAttribute("aria-label") ?? "");
}

test("shows its title and description, and each query's rows, in order", async () => {
  const ran = recordRuns();
  renderApp(`/dashboards/${overview?.id}`);

  expect(await screen.findByRole("heading", { name: /Shop overview/ })).toBeDefined();
  expect(screen.getByText(overview!.description!)).toBeDefined();
  expect(sectionTitles()).toEqual(["Daily signups", "Open orders", "A query you can't see"]);
  const signups = within(screen.getByRole("region", { name: "Daily signups" }));
  const grid = await signups.findByRole("table", { name: "Daily signups's rows" });
  expect(within(grid).getByText("alan@example.com")).toBeDefined();
  expect(signups.getByText("3 rows in 12 ms")).toBeDefined();
  expect(signups.getByText(daily!.description!)).toBeDefined();
  await screen.findByRole("table", { name: "Open orders's rows" });
  expect(ran.toSorted()).toEqual([daily!.sql, open!.sql].toSorted());
  expect(screen.getByText("Someone's personal query, which only they see.")).toBeDefined();
  const nav = within(screen.getByRole("navigation", { name: "Main" }));
  expect(nav.getByRole("link", { name: "Dashboards" }).getAttribute("aria-current")).toBe("page");
});

test("opens a query in the explorer", async () => {
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("link", { name: "Open orders" }));

  expect(window.location.pathname).toBe("/explore");
  expect(window.location.search).toBe(`?connection=shop&query=${open?.id}`);
});

test("moves a query down, keeping its rows, and saves the new order", async () => {
  const sent = recordSaves();
  const ran = recordRuns();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);
  await screen.findByRole("table", { name: "Daily signups's rows" });
  await screen.findByRole("table", { name: "Open orders's rows" });

  await user.click(screen.getByRole("button", { name: "Move Daily signups down" }));

  expect(sectionTitles()).toEqual(["Open orders", "Daily signups", "A query you can't see"]);
  await waitFor(() => {
    expect(sent).toHaveLength(1);
  });
  expect(sent[0]).toEqual({
    items: [open!.id, daily!.id, "0199a1b2-0000-7000-8000-0000000000af"].map((savedQueryId) => ({
      savedQueryId,
      visualization: "table",
    })),
  });
  expect(ran).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Move Open orders up" })).toHaveProperty(
    "disabled",
    true,
  );
});

test("puts a query back where it was when saving the new order fails", async () => {
  server.use(
    http.patch("/api/dashboards/:id", () =>
      HttpResponse.json({ error: "The database is down" }, { status: 500 }),
    ),
  );
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Move Open orders up" }));

  expect(
    await screen.findByText("Couldn't save the dashboard: The database is down"),
  ).toBeDefined();
  expect(sectionTitles()).toEqual(["Daily signups", "Open orders", "A query you can't see"]);
});

test("removes a query", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Remove Open orders" }));

  expect(sectionTitles()).toEqual(["Daily signups", "A query you can't see"]);
  await waitFor(() => {
    expect(sent).toHaveLength(1);
  });
});

test("adds a saved query at the bottom, as a table", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${weekly?.id}`);

  expect(await screen.findByText(/No queries on this dashboard yet/)).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Add query" }));
  const form = within(await screen.findByRole("form", { name: "Add a query" }));
  expect(form.getByRole("combobox", { name: "Show as" }).textContent).toBe("Table");
  await user.click(form.getByRole("combobox", { name: "Saved query" }));
  await user.click(await screen.findByRole("option", { name: "Unpaid invoices" }));
  await user.click(form.getByRole("button", { name: "Add" }));

  const added = within(await screen.findByRole("region", { name: "Unpaid invoices" }));
  // Its database was deleted, so there's nothing to run it on.
  expect(added.getByText(/Its database was deleted/)).toBeDefined();
  expect(sent).toEqual([{ items: [{ savedQueryId: unpaid!.id, visualization: "table" }] }]);
});

test("runs every query again", async () => {
  const ran = recordRuns();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);
  await screen.findByRole("table", { name: "Daily signups's rows" });
  await screen.findByRole("table", { name: "Open orders's rows" });

  await user.click(screen.getByRole("button", { name: "Run again" }));

  await waitFor(() => {
    expect(ran).toHaveLength(4);
  });
  expect(screen.getByRole("table", { name: "Daily signups's rows" })).toBeDefined();
});

test("says why a query failed", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", () =>
      HttpResponse.json({ error: 'relation "customers" does not exist' }, { status: 400 }),
    ),
  );
  renderApp(`/dashboards/${overview?.id}`);

  const signups = within(await screen.findByRole("region", { name: "Daily signups" }));
  expect(await signups.findByText('relation "customers" does not exist')).toBeDefined();
});

test("someone who can't change it only sees it", async () => {
  server.use(
    http.get("/api/me", () => HttpResponse.json(viewer)),
    http.get("/api/dashboards/:id", () => HttpResponse.json({ ...overview, canEdit: false })),
  );
  renderApp(`/dashboards/${overview?.id}`);

  await screen.findByRole("table", { name: "Daily signups's rows" });
  expect(screen.queryByRole("button", { name: "Add query" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
  expect(screen.queryByRole("button", { name: "Actions for Shop overview" })).toBeNull();
  expect(screen.getByRole("button", { name: "Run again" })).toBeDefined();
});

test("deletes the dashboard and goes back to the list", async () => {
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Actions for Shop overview" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await user.click(await screen.findByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(window.location.pathname).toBe("/dashboards");
  });
});

test("says so when there's no such dashboard", async () => {
  renderApp("/dashboards/0199a1b2-0000-7000-8000-0000000000ff");

  expect(await screen.findByText(/There's no such dashboard/)).toBeDefined();
});
