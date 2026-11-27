import { expect, test } from "bun:test";

import { EditorView } from "@codemirror/view";
import { updateSavedQueryRequest } from "@pg_select1/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { savedQueries, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const [daily, open, unpaid] = savedQueries;

function sqlOf(editor: HTMLElement): string {
  return EditorView.findFromDOM(editor)?.state.doc.toString() ?? "";
}

test("lists saved queries with their database, scope and who saved them", async () => {
  renderApp("/queries");

  const dailyRow = (await screen.findByRole("link", { name: "Daily signups" })).closest("tr");
  const unpaidRow = screen.getByRole("link", { name: "Unpaid invoices" }).closest("tr");
  const openRow = screen.getByRole("link", { name: "Open orders" }).closest("tr");
  expect(within(dailyRow!).getByText("shop")).toBeDefined();
  expect(within(dailyRow!).getByText("global")).toBeDefined();
  expect(within(dailyRow!).getByText("You")).toBeDefined();
  expect(within(dailyRow!).getByText("New customers per day, oldest first")).toBeDefined();
  expect(within(openRow!).getByText("personal")).toBeDefined();
  // Its database was deleted.
  expect(within(unpaidRow!).getByText("none")).toBeDefined();
  expect(within(unpaidRow!).getByText("Eddie Editor")).toBeDefined();
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).getByRole("link", { name: "Queries" }).getAttribute("aria-current")).toBe(
    "page",
  );
});

test("says so when there are none", async () => {
  server.use(http.get("/api/saved-queries", () => HttpResponse.json({ savedQueries: [] })));
  renderApp("/queries");

  expect(await screen.findByText(/No saved queries yet/)).toBeDefined();
});

test("opens a saved query in the explorer, with its SQL and database", async () => {
  const user = userEvent.setup();
  renderApp("/queries");

  await user.click(await screen.findByRole("link", { name: "Daily signups" }));

  expect(window.location.pathname).toBe("/explore");
  expect(window.location.search).toBe(`?connection=shop&query=${daily?.id}`);
  expect(await screen.findByRole("heading", { name: "Daily signups" })).toBeDefined();
  const editor = screen.getByRole("textbox", { name: "SQL" });
  await waitFor(() => {
    expect(sqlOf(editor)).toBe(daily?.sql ?? "");
  });
  expect(screen.getByRole("combobox", { name: "Database" }).textContent).toContain("shop");
});

test("changes a query's name, description and scope", async () => {
  let sent: unknown;
  server.use(
    http.patch("/api/saved-queries/:id", async ({ request }) => {
      sent = updateSavedQueryRequest.parse(await request.json());
      return HttpResponse.json({ ...open, name: "All open orders", scope: "global" });
    }),
  );
  const user = userEvent.setup();
  renderApp("/queries");

  await user.click(await screen.findByRole("button", { name: "Actions for Open orders" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit details" }));
  const form = within(await screen.findByRole("form", { name: "Edit Open orders" }));
  await user.clear(form.getByLabelText("Name"));
  await user.type(form.getByLabelText("Name"), "All open orders");
  await user.click(form.getByRole("switch", { name: "Share with everyone" }));
  await user.click(form.getByRole("button", { name: "Save" }));

  const row = (await screen.findByRole("link", { name: "All open orders" })).closest("tr");
  expect(within(row!).getByText("global")).toBeDefined();
  expect(sent).toEqual({ name: "All open orders", description: null, scope: "global" });
});

test("only its owner sees who sees a query when editing it", async () => {
  server.use(http.get("/api/saved-queries", () => HttpResponse.json({ savedQueries: [unpaid] })));
  const user = userEvent.setup();
  renderApp("/queries");

  await user.click(await screen.findByRole("button", { name: "Actions for Unpaid invoices" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit details" }));

  const form = within(await screen.findByRole("form", { name: "Edit Unpaid invoices" }));
  expect(form.queryByRole("switch")).toBeNull();
});

test("deletes a query after asking", async () => {
  const user = userEvent.setup();
  renderApp("/queries");

  await user.click(await screen.findByRole("button", { name: "Actions for Daily signups" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  const dialog = within(await screen.findByRole("alertdialog"));
  expect(dialog.getByText(/gone for everyone/)).toBeDefined();
  await user.click(dialog.getByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(screen.queryByRole("link", { name: "Daily signups" })).toBeNull();
  });
});

test("offers no changes to a query its user can't change", async () => {
  server.use(
    http.get("/api/me", () => HttpResponse.json(viewer)),
    http.get("/api/saved-queries", () =>
      HttpResponse.json({ savedQueries: [{ ...daily, canEdit: false }] }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/queries");

  await user.click(await screen.findByRole("button", { name: "Actions for Daily signups" }));

  expect(await screen.findByRole("menuitem", { name: "Open in explorer" })).toBeDefined();
  expect(screen.queryByRole("menuitem", { name: "Edit details" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
});
