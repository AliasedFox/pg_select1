import { expect, test } from "bun:test";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { admin, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("opens from the account menu", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  await user.click(await screen.findByRole("button", { name: "Account menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Your profile" }));

  expect(await screen.findByRole("heading", { name: "Your profile" })).toBeDefined();
  expect(window.location.pathname).toBe("/profile");
});

test("shows the email, which can't be changed", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  renderApp("/profile");

  const email = await screen.findByLabelText<HTMLInputElement>("Email");
  expect(email.value).toBe(viewer.email);
  expect(email.readOnly).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(viewer.name);
});

test("saves a new name, and the account menu shows it", async () => {
  let current = admin;
  let sent: unknown;
  server.use(
    http.get("/api/me", () => HttpResponse.json(current)),
    http.patch("/api/me", async ({ request }) => {
      sent = await request.json();
      current = { ...admin, name: "Ada Lovelace" };
      return HttpResponse.json(current);
    }),
  );
  const user = userEvent.setup();
  renderApp("/profile");

  const name = await screen.findByLabelText("Name");
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.hasAttribute("disabled")).toBe(true);
  await user.clear(name);
  await user.type(name, "Ada Lovelace");
  await user.click(save);

  expect((await screen.findByRole("status")).textContent).toBe("Your name is saved.");
  expect(sent).toEqual({ name: "Ada Lovelace" });
  await user.click(screen.getByRole("button", { name: "Account menu" }));
  expect(within(screen.getByRole("menu")).getByText("Ada Lovelace")).toBeDefined();
});

test("changes the password, signing out everywhere else", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/auth/change-password", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ token: "t2", user: admin });
    }),
  );
  const user = userEvent.setup();
  renderApp("/profile");

  await user.type(await screen.findByLabelText("Current password"), "my old password");
  await user.type(screen.getByLabelText("New password"), "a brand new password");
  await user.type(screen.getByLabelText("Confirm new password"), "a brand new password");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  expect((await screen.findByRole("status")).textContent).toBe(
    "Your password is changed, and you're signed out everywhere else.",
  );
  expect(sent).toEqual({
    currentPassword: "my old password",
    newPassword: "a brand new password",
    revokeOtherSessions: true,
  });
  expect(screen.getByLabelText<HTMLInputElement>("Current password").value).toBe("");
});

test("doesn't change the password when the new ones don't match", async () => {
  let called = false;
  server.use(
    http.post("/api/auth/change-password", () => {
      called = true;
      return HttpResponse.json({ token: "t2", user: admin });
    }),
  );
  const user = userEvent.setup();
  renderApp("/profile");

  await user.type(await screen.findByLabelText("Current password"), "my old password");
  await user.type(screen.getByLabelText("New password"), "a brand new password");
  await user.type(screen.getByLabelText("Confirm new password"), "a different password");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  expect((await screen.findByRole("alert")).textContent).toBe("The new passwords don't match.");
  expect(called).toBe(false);
});

test("says so when the current password is wrong", async () => {
  server.use(
    http.post("/api/auth/change-password", () =>
      HttpResponse.json({ message: "Invalid password", code: "INVALID_PASSWORD" }, { status: 400 }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/profile");

  await user.type(await screen.findByLabelText("Current password"), "not my password");
  await user.type(screen.getByLabelText("New password"), "a brand new password");
  await user.type(screen.getByLabelText("Confirm new password"), "a brand new password");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  expect((await screen.findByRole("alert")).textContent).toBe("Your current password is wrong.");
});
