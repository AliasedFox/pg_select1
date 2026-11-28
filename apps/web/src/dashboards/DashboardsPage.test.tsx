import { expect, test } from "bun:test";

import { createDashboardRequest, updateDashboardRequest } from "@pg_select1/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { dashboards } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const [overview, weekly] = dashboards;

test("lists dashboards with how many queries are on them, their scope and who made them", async () => {
  renderApp("/dashboards");

  const overviewRow = (await screen.findByRole("link", { name: "Shop overview" })).closest("tr");
  const weeklyRow = screen.getByRole("link", { name: "Weekly review" }).closest("tr");
  expect(within(overviewRow!).getByText("3")).toBeDefined();
  expect(within(overviewRow!).getByText("global")).toBeDefined();
  expect(within(overviewRow!).getByText("You")).toBeDefined();
  expect(within(overviewRow!).getByText(overview!.description!)).toBeDefined();
  expect(within(weeklyRow!).getByText("personal")).toBeDefined();
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).getByRole("link", { name: "Dashboards" }).getAttribute("aria-current")).toBe(
    "page",
  );
});

test("says so when there are none", async () => {
  server.use(http.get("/api/dashboards", () => HttpResponse.json({ dashboards: [] })));
  renderApp("/dashboards");

  expect(await screen.findByText(/No dashboards yet/)).toBeDefined();
});

test("makes a dashboard with a title and description, and opens it", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/dashboards", async ({ request }) => {
      sent = createDashboardRequest.parse(await request.json());
      return HttpResponse.json(
        { ...weekly, name: "Ops", description: "For on-call" },
        { status: 201 },
      );
    }),
  );
  const user = userEvent.setup();
  renderApp("/dashboards");

  await user.click(await screen.findByRole("button", { name: "New dashboard" }));
  const form = within(await screen.findByRole("form", { name: "New dashboard" }));
  await user.type(form.getByLabelText("Title"), "Ops");
  await user.type(form.getByLabelText("Description"), "For on-call");
  await user.click(form.getByRole("button", { name: "Create" }));

  await waitFor(() => {
    expect(window.location.pathname).toBe(`/dashboards/${weekly?.id}`);
  });
  expect(sent).toEqual({
    name: "Ops",
    description: "For on-call",
    scope: "personal",
    refreshMinutes: null,
    items: [],
  });
});

test("changes a dashboard's title and description", async () => {
  let sent: unknown;
  server.use(
    http.patch("/api/dashboards/:id", async ({ request }) => {
      sent = updateDashboardRequest.parse(await request.json());
      return HttpResponse.json({ ...weekly, name: "Monthly review" });
    }),
  );
  const user = userEvent.setup();
  renderApp("/dashboards");

  await user.click(await screen.findByRole("button", { name: "Actions for Weekly review" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit details" }));
  const form = within(await screen.findByRole("form", { name: "Edit Weekly review" }));
  await user.clear(form.getByLabelText("Title"));
  await user.type(form.getByLabelText("Title"), "Monthly review");
  await user.click(form.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("link", { name: "Monthly review" })).toBeDefined();
  expect(sent).toEqual({ name: "Monthly review", description: null, scope: "personal" });
});

test("deletes a dashboard", async () => {
  const user = userEvent.setup();
  renderApp("/dashboards");

  await user.click(await screen.findByRole("button", { name: "Actions for Weekly review" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await user.click(await screen.findByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(screen.queryByRole("link", { name: "Weekly review" })).toBeNull();
  });
  expect(screen.getByRole("link", { name: "Shop overview" })).toBeDefined();
});
