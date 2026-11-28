import { expect, jest, test } from "bun:test";

import { runQueryRequest, updateDashboardRequest } from "@pg_select1/shared";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { dashboards, queryRows, savedQueries, signupRows, viewer } from "../../test/fixtures";
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

test("shows each query as it was saved: a chart, a number or a table", async () => {
  server.use(
    http.post("/api/explore/connections/:id/query", async ({ request }) => {
      const { sql } = runQueryRequest.parse(await request.json());
      return HttpResponse.json(sql === daily?.sql ? signupRows : queryRows);
    }),
    http.get("/api/dashboards/:id", () =>
      HttpResponse.json({
        ...overview,
        items: overview!.items.map((item, index) =>
          item.kind === "query" && item.savedQuery && index < 2
            ? {
                ...item,
                savedQuery: {
                  ...item.savedQuery,
                  display: index === 0 ? { type: "chart", kind: "bar" } : { type: "number" },
                },
              }
            : item,
        ),
      }),
    ),
  );
  renderApp(`/dashboards/${overview?.id}`);

  const signups = within(await screen.findByRole("region", { name: "Daily signups" }));
  expect(await signups.findByRole("figure", { name: "Result chart" })).toBeDefined();
  // Only the chart: its kind is changed in the explorer.
  expect(signups.queryByRole("group", { name: "Chart" })).toBeNull();
  expect(signups.queryByRole("table")).toBeNull();
  const orders = within(screen.getByRole("region", { name: "Open orders" }));
  const number = await orders.findByRole("figure", { name: "Result number" });
  // The customers' first row's first column, their id.
  expect(within(number).getByText("id")).toBeDefined();
  // One value, so its database rather than how many rows it had and how long they took.
  expect(orders.queryByText("1 row in 12 ms")).toBeNull();
  expect(orders.getByText(open!.connections[0]!.name)).toBeDefined();
  expect(orders.queryByRole("table")).toBeNull();
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

test("removes a query once it's asked whether to", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Remove Open orders" }));
  const asked = within(await screen.findByRole("alertdialog"));
  expect(asked.getByText("Remove Open orders from the dashboard?")).toBeDefined();
  await user.click(asked.getByRole("button", { name: "Cancel" }));
  expect(sectionTitles()).toEqual(["Daily signups", "Open orders", "A query you can't see"]);

  await user.click(screen.getByRole("button", { name: "Remove Open orders" }));
  await user.click(await screen.findByRole("button", { name: "Remove" }));

  expect(sectionTitles()).toEqual(["Daily signups", "A query you can't see"]);
  await waitFor(() => {
    expect(sent).toHaveLength(1);
  });
});

test("adds a title at the bottom, then changes it", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Add a query or title" }));
  const adding = within(await screen.findByRole("form", { name: "Add to the dashboard" }));
  await user.click(adding.getByRole("radio", { name: "Title" }));
  await user.type(adding.getByRole("textbox", { name: "Title" }), "Shipping");
  await user.click(adding.getByRole("button", { name: "Add" }));

  expect(await screen.findByRole("heading", { name: "Shipping" })).toBeDefined();
  expect(sectionTitles()).toEqual([
    "Daily signups",
    "Open orders",
    "A query you can't see",
    "Shipping",
  ]);
  // Changed where it stands, as the dashboard's own title is.
  await user.click(screen.getByRole("button", { name: "Shipping" }));
  const field = screen.getByRole("textbox", { name: "Title" });
  await user.clear(field);
  await user.type(field, "Orders{Enter}");

  expect(await screen.findByRole("heading", { name: "Orders" })).toBeDefined();
  const queries = [daily!.id, open!.id, "0199a1b2-0000-7000-8000-0000000000af"].map(
    (savedQueryId) => ({ savedQueryId }),
  );
  expect(sent).toEqual([
    { items: [...queries, { title: "Shipping" }] },
    { items: [...queries, { title: "Orders" }] },
  ]);
});

test("doesn't add a query that's on the dashboard already", async () => {
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Add a query or title" }));
  const form = within(await screen.findByRole("form", { name: "Add to the dashboard" }));
  await user.click(form.getByRole("combobox", { name: "Saved query" }));

  const onIt = await screen.findByRole("option", { name: /Open orders/ });
  expect(onIt.getAttribute("aria-disabled")).toBe("true");
  expect(within(onIt).getByText("On the dashboard")).toBeDefined();
  const notOnIt = screen.getByRole("option", { name: "Unpaid invoices" });
  expect(notOnIt.getAttribute("aria-disabled")).toBeNull();
});

test("adds a saved query at the bottom", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${weekly?.id}`);

  expect(await screen.findByText(/No queries on this dashboard yet/)).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Add a query or title" }));
  const form = within(await screen.findByRole("form", { name: "Add to the dashboard" }));
  expect(form.getByRole("radio", { name: "Saved query" })).toHaveProperty("checked", true);
  await user.click(form.getByRole("combobox", { name: "Saved query" }));
  await user.click(await screen.findByRole("option", { name: "Unpaid invoices" }));
  await user.click(form.getByRole("button", { name: "Add" }));

  const added = within(await screen.findByRole("region", { name: "Unpaid invoices" }));
  // Its database was deleted, so there's nothing to run it on.
  expect(added.getByText(/Its database was deleted/)).toBeDefined();
  expect(sent).toEqual([{ items: [{ savedQueryId: unpaid!.id }] }]);
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

test("turns the dial to how often it runs its queries again, and saves where it rests", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  const dial = await screen.findByRole("slider", { name: "How often to run the queries again" });
  expect(dial.getAttribute("aria-valuetext")).toBe("Doesn't refresh by itself");
  // Each click turns it a notch: past 3 minutes, to 5.
  await user.click(dial);
  await user.click(dial);
  expect(dial.getAttribute("aria-valuetext")).toBe("Refreshes every 5 minutes");

  await waitFor(() => {
    expect(sent).toEqual([{ refreshMinutes: 5 }]);
  });
  dial.focus();
  await user.keyboard("{End}");
  expect(dial.getAttribute("aria-valuetext")).toBe("Refreshes every hour");
  await user.keyboard("{Enter}");
  expect(dial.getAttribute("aria-valuetext")).toBe("Doesn't refresh by itself");
  await waitFor(() => {
    expect(sent).toEqual([{ refreshMinutes: 5 }, { refreshMinutes: null }]);
  });
});

test("someone who can't change it turns the dial for themselves", async () => {
  const sent = recordSaves();
  server.use(
    http.get("/api/me", () => HttpResponse.json(viewer)),
    http.get("/api/dashboards/:id", () => HttpResponse.json({ ...overview, canEdit: false })),
  );
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  const dial = await screen.findByRole("slider", { name: "How often to run the queries again" });
  await user.click(dial);

  await waitFor(() => {
    expect(dial.getAttribute("aria-valuenow")).toBe("1");
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
  expect(dial.getAttribute("aria-valuetext")).toBe("Refreshes every 3 minutes");
  expect(sent).toEqual([]);
});

test("runs its queries again as often as it says, counting from when they last ran", async () => {
  server.use(
    http.get("/api/dashboards/:id", () => HttpResponse.json({ ...overview, refreshMinutes: 3 })),
  );
  const ran = recordRuns();
  renderApp(`/dashboards/${overview?.id}`);
  await screen.findByRole("table", { name: "Daily signups's rows" });
  await screen.findByRole("table", { name: "Open orders's rows" });

  // Counted as each one starts, which needs no timers, unlike reading what it runs.
  let started = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/query")) started += 1;
  });
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });

  jest.useFakeTimers();
  try {
    // Running them by hand starts the wait over, now on the fake clock.
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    await settle();
    expect(started).toBe(2);
    act(() => {
      jest.advanceTimersByTime(3 * 60_000 - 1);
    });
    await settle();
    expect(started).toBe(2);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    await settle();
    expect(started).toBe(4);
  } finally {
    jest.useRealTimers();
  }
  await waitFor(() => {
    expect(ran).toHaveLength(6);
  });
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
  expect(screen.queryByRole("button", { name: "Add a query or title" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete the dashboard" })).toBeNull();
  // Its title is only text, not something to click to change.
  expect(screen.queryByRole("button", { name: "Shop overview" })).toBeNull();
  expect(screen.getByRole("button", { name: "Run again" })).toBeDefined();
});

test("changes its title where it stands, keeping it on Enter and putting it back on Escape", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Shop overview" }));
  const field = screen.getByRole("textbox", { name: "Title" });
  expect(document.activeElement).toBe(field);
  await user.clear(field);
  await user.type(field, "Shop at a glance{Enter}");

  expect(await screen.findByRole("heading", { name: /Shop at a glance/ })).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Shop at a glance" }));
  await user.type(screen.getByRole("textbox", { name: "Title" }), " again{Escape}");

  expect(screen.getByRole("heading", { name: /Shop at a glance/ })).toBeDefined();
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  await waitFor(() => {
    expect(sent).toEqual([{ name: "Shop at a glance" }]);
  });
});

test("changes its description where it stands, keeping it on Enter or when clicked away from", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${weekly?.id}`);

  await user.click(await screen.findByRole("button", { name: "Add a description" }));
  await user.type(screen.getByRole("textbox", { name: "Description" }), "Every Monday{Enter}");
  expect(await screen.findByRole("button", { name: "Every Monday" })).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Every Monday" }));
  await user.type(screen.getByRole("textbox", { name: "Description" }), " with the team");
  await user.click(document.body);

  expect(await screen.findByRole("button", { name: "Every Monday with the team" })).toBeDefined();
  await waitFor(() => {
    expect(sent).toEqual([
      { description: "Every Monday" },
      { description: "Every Monday with the team" },
    ]);
  });
});

test("doesn't save a title left blank", async () => {
  const sent = recordSaves();
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Shop overview" }));
  await user.clear(screen.getByRole("textbox", { name: "Title" }));
  await user.keyboard("{Enter}");

  expect(screen.getByRole("heading", { name: /Shop overview/ })).toBeDefined();
  expect(sent).toEqual([]);
});

test("deletes the dashboard and goes back to the list", async () => {
  const user = userEvent.setup();
  renderApp(`/dashboards/${overview?.id}`);

  await user.click(await screen.findByRole("button", { name: "Delete the dashboard" }));
  await user.click(await screen.findByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(window.location.pathname).toBe("/dashboards");
  });
});

test("says so when there's no such dashboard", async () => {
  renderApp("/dashboards/0199a1b2-0000-7000-8000-0000000000ff");

  expect(await screen.findByText(/There's no such dashboard/)).toBeDefined();
});
