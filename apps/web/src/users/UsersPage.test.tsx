import { expect, test } from "bun:test";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { link } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("lists users with their role and whether they've accepted their invite", async () => {
  renderApp("/users");

  const row = (await screen.findByText("vic@example.com")).closest("tr");
  expect(row).not.toBeNull();
  expect(within(row!).getByText("viewer")).toBeDefined();
  expect(within(row!).getByText("invited")).toBeDefined();
  expect(screen.getByText("(you)")).toBeDefined();
  expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-current")).toBe("page");
});

test("invites someone and shows the link to send them", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/users", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(
        {
          user: {
            id: "0199a1b2-0000-7000-8000-000000000009",
            email: "nia@example.com",
            name: "Nia New",
            role: "viewer",
            status: "invited",
            createdAt: "2026-01-05T09:00:00.000Z",
          },
          link,
        },
        { status: 201 },
      );
    }),
  );
  const user = userEvent.setup();
  renderApp("/users");

  await user.click(await screen.findByRole("button", { name: "Invite user" }));
  await user.type(screen.getByLabelText("Email"), "nia@example.com");
  await user.type(screen.getByLabelText("Name"), "Nia New");
  await user.click(screen.getByRole("button", { name: "Invite" }));

  expect(await screen.findByText("Invite link for nia@example.com")).toBeDefined();
  expect(screen.getByLabelText<HTMLInputElement>("Link").value).toBe(link.url);
  expect(sent).toEqual({ email: "nia@example.com", name: "Nia New", role: "viewer" });
  expect(screen.getByText("Nia New")).toBeDefined();
});

test("shows why an invite is refused", async () => {
  server.use(
    http.post("/api/users", () =>
      HttpResponse.json({ error: "eddie@example.com already has an account" }, { status: 409 }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/users");

  await user.click(await screen.findByRole("button", { name: "Invite user" }));
  await user.type(screen.getByLabelText("Email"), "eddie@example.com");
  await user.type(screen.getByLabelText("Name"), "Eddie");
  await user.click(screen.getByRole("button", { name: "Invite" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    "eddie@example.com already has an account",
  );
});

test("renames someone", async () => {
  const user = userEvent.setup();
  renderApp("/users");

  await user.click(await screen.findByRole("button", { name: "Actions for eddie@example.com" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  const name = screen.getByLabelText("Name");
  await user.clear(name);
  await user.type(name, "Edward Editor");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Edward Editor")).toBeDefined();
});

test("makes a new invite link for someone invited", async () => {
  const user = userEvent.setup();
  renderApp("/users");

  await user.click(await screen.findByRole("button", { name: "Actions for vic@example.com" }));
  await user.click(await screen.findByRole("menuitem", { name: "New invite link" }));

  expect(await screen.findByText("Invite link for vic@example.com")).toBeDefined();
});

test("deletes someone after asking", async () => {
  const user = userEvent.setup();
  renderApp("/users");

  await user.click(await screen.findByRole("button", { name: "Actions for eddie@example.com" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  expect(await screen.findByText("Delete eddie@example.com?")).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Delete" }));

  await screen.findByRole("button", { name: "Invite user" });
  expect(screen.queryByText("eddie@example.com")).toBeNull();
});

test("offers no delete for the admin themselves", async () => {
  const user = userEvent.setup();
  renderApp("/users");

  await user.click(await screen.findByRole("button", { name: "Actions for ada@example.com" }));

  await screen.findByRole("menuitem", { name: "Edit" });
  expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
});
