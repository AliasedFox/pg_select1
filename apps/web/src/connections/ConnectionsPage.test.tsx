import { expect, test } from "bun:test";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("lists connections by name with where they are and whether they're visible", async () => {
  renderApp("/connections");

  const shop = (await screen.findByText("shop")).closest("tr");
  const billing = screen.getByText("billing").closest("tr");
  expect(within(shop!).getByText("postgres@localhost:5432/shop")).toBeDefined();
  expect(within(shop!).getByText("visible")).toBeDefined();
  expect(within(billing!).getByText("hidden")).toBeDefined();
  expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-current")).toBe("page");
});

test("adds a connection from a pasted URL, hidden unless made visible", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/connections", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(
        {
          id: "0199a1b2-0000-7000-8000-0000000000c9",
          name: "crm",
          host: "crm.internal",
          port: 6432,
          database: "crm",
          username: "reader",
          hasPassword: true,
          sslMode: "require",
          visible: false,
          createdAt: "2026-01-04T09:00:00.000Z",
          updatedAt: "2026-01-04T09:00:00.000Z",
        },
        { status: 201 },
      );
    }),
  );
  const user = userEvent.setup();
  renderApp("/connections");

  const form = within(await screen.findByRole("form", { name: "Add a connection" }));
  await user.click(form.getByLabelText("Connection URL"));
  await user.paste("postgresql://reader:s3cret@crm.internal:6432/crm?sslmode=require");

  expect(form.getByLabelText<HTMLInputElement>("Name").value).toBe("crm");
  expect(form.getByLabelText<HTMLInputElement>("Host").value).toBe("crm.internal");
  expect(form.getByLabelText<HTMLInputElement>("Password").value).toBe("s3cret");
  await user.click(form.getByRole("button", { name: "Add connection" }));

  const row = (await screen.findByText("crm")).closest("tr");
  expect(within(row!).getByText("hidden")).toBeDefined();
  // The form is empty again, for the next one.
  expect(form.getByLabelText<HTMLInputElement>("Name").value).toBe("");
  expect(form.getByLabelText<HTMLInputElement>("Connection URL").value).toBe("");
  expect(sent).toEqual({
    name: "crm",
    host: "crm.internal",
    port: 6432,
    database: "crm",
    username: "reader",
    password: "s3cret",
    sslMode: "require",
    visible: false,
  });
});

test("adds a connection visible to everyone", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/connections", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ error: "stop here" }, { status: 400 });
    }),
  );
  const user = userEvent.setup();
  renderApp("/connections");

  const form = within(await screen.findByRole("form", { name: "Add a connection" }));
  await user.type(form.getByLabelText("Name"), "crm");
  await user.type(form.getByLabelText("Host"), "crm.internal");
  await user.type(form.getByLabelText("Database"), "crm");
  await user.type(form.getByLabelText("User"), "reader");
  await user.click(form.getByRole("switch", { name: "Visible to everyone" }));
  await user.click(form.getByRole("button", { name: "Add connection" }));

  expect((await form.findByRole("alert")).textContent).toBe("stop here");
  // A refused connection stays in the form, to fix and try again.
  expect(form.getByLabelText<HTMLInputElement>("Name").value).toBe("crm");
  expect(sent).toMatchObject({ visible: true });
});

test("tests the form's settings before saving them", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/connections/test", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({
        ok: false,
        error: 'password authentication failed for user "reader"',
      });
    }),
  );
  const user = userEvent.setup();
  renderApp("/connections");

  await user.click(await screen.findByRole("button", { name: "Actions for billing" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Edit billing" }));
  expect(dialog.getByLabelText<HTMLInputElement>("Password").placeholder).toBe("Unchanged");
  await user.click(dialog.getByRole("button", { name: "Test connection" }));

  expect((await dialog.findByRole("alert")).textContent).toBe(
    'Couldn\'t connect: password authentication failed for user "reader"',
  );
  expect(sent).toMatchObject({
    host: "billing.internal",
    password: "",
    connectionId: "0199a1b2-0000-7000-8000-0000000000c1",
  });
});

test("tests a saved connection from its menu", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  await user.click(await screen.findByRole("button", { name: "Actions for shop" }));
  await user.click(await screen.findByRole("menuitem", { name: "Test connection" }));

  expect((await screen.findByRole("status")).textContent).toBe(
    "Connected to PostgreSQL 17.2 in 12 ms.",
  );
});

test("makes a hidden connection visible", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  await user.click(await screen.findByRole("button", { name: "Actions for billing" }));
  await user.click(await screen.findByRole("menuitem", { name: "Make visible" }));

  const row = (await screen.findByText("billing")).closest("tr");
  expect(await within(row!).findByText("visible")).toBeDefined();
});

test("deletes a connection after asking", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  await user.click(await screen.findByRole("button", { name: "Actions for shop" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  expect(await screen.findByText("Delete shop?")).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Delete" }));

  await screen.findByRole("form", { name: "Add a connection" });
  expect(screen.queryByText("shop")).toBeNull();
});

test("isn't there for someone who isn't an admin", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  renderApp("/connections");

  expect(await screen.findByText("Only admins can manage connections.")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
});

test("edits a connection in a dialog, which closes once it's saved", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  await user.click(await screen.findByRole("button", { name: "Actions for billing" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Edit billing" }));
  const host = dialog.getByLabelText("Host");
  await user.clear(host);
  await user.type(host, "billing.example.com");
  await user.click(dialog.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("reader@billing.example.com:5432/billing")).toBeDefined();
  expect(screen.queryByRole("dialog")).toBeNull();
});
