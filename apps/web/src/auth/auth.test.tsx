import { expect, test } from "bun:test";

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { admin, signedOut, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("asks to sign in when nobody is", async () => {
  server.use(signedOut);
  renderApp("/");

  expect(await screen.findByText("No account? Ask an admin to invite you.")).toBeDefined();
  expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
});

test("signs in and shows the app", async () => {
  let signedIn = false;
  server.use(
    http.get("/api/me", () =>
      signedIn
        ? HttpResponse.json(admin)
        : HttpResponse.json({ error: "Sign in first" }, { status: 401 }),
    ),
    http.post("/api/auth/sign-in/email", () => {
      signedIn = true;
      return HttpResponse.json({ redirect: false });
    }),
  );
  const user = userEvent.setup();
  renderApp("/sign-in");

  await user.type(await screen.findByLabelText("Email"), admin.email);
  await user.type(screen.getByLabelText("Password"), "a long password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByText("Ada Admin")).toBeDefined();
  expect(await screen.findByRole("heading", { name: "Connections" })).toBeDefined();
  expect(window.location.pathname).toBe("/connections");
});

test("says so when the password is wrong", async () => {
  server.use(
    signedOut,
    http.post("/api/auth/sign-in/email", () =>
      HttpResponse.json({ message: "Invalid email or password" }, { status: 401 }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/");

  await user.type(await screen.findByLabelText("Email"), admin.email);
  await user.type(screen.getByLabelText("Password"), "wrong password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect((await screen.findByRole("alert")).textContent).toBe("Invalid email or password");
});

test("sets a password from a link, then asks to sign in", async () => {
  let sent: unknown;
  server.use(
    signedOut,
    http.post("/api/auth/reset-password", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ status: true });
    }),
  );
  const user = userEvent.setup();
  renderApp("/set-password?token=abc");

  await user.type(await screen.findByLabelText("New password"), "a brand new password");
  await user.type(screen.getByLabelText("Confirm password"), "a brand new password");
  await user.click(screen.getByRole("button", { name: "Set password" }));

  expect(await screen.findByText("Your password is set. Sign in with it.")).toBeDefined();
  expect(sent).toEqual({ token: "abc", newPassword: "a brand new password" });
});

test("says so when the passwords don't match", async () => {
  const user = userEvent.setup();
  renderApp("/set-password?token=abc");

  await user.type(await screen.findByLabelText("New password"), "a brand new password");
  await user.type(screen.getByLabelText("Confirm password"), "another password!!");
  await user.click(screen.getByRole("button", { name: "Set password" }));

  expect((await screen.findByRole("alert")).textContent).toBe("The passwords don't match.");
});

test("says so when a link has expired", async () => {
  server.use(
    http.post("/api/auth/reset-password", () =>
      HttpResponse.json({ message: "Invalid token", code: "INVALID_TOKEN" }, { status: 400 }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/set-password?token=old");

  await user.type(await screen.findByLabelText("New password"), "a brand new password");
  await user.type(screen.getByLabelText("Confirm password"), "a brand new password");
  await user.click(screen.getByRole("button", { name: "Set password" }));

  expect((await screen.findByRole("alert")).textContent).toContain("expired or was already used");
});

test("signs out", async () => {
  let signedIn = true;
  server.use(
    http.get("/api/me", () =>
      signedIn
        ? HttpResponse.json(admin)
        : HttpResponse.json({ error: "Sign in first" }, { status: 401 }),
    ),
    http.post("/api/auth/sign-out", () => {
      signedIn = false;
      return HttpResponse.json({ success: true });
    }),
  );
  const user = userEvent.setup();
  renderApp("/");

  await user.click(await screen.findByRole("button", { name: "Sign out" }));

  expect(await screen.findByText("No account? Ask an admin to invite you.")).toBeDefined();
});

test("a viewer sees no Users page", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  renderApp("/users");

  expect(await screen.findByText("Only admins can manage users.")).toBeDefined();
  expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
});

test("someone who isn't an admin lands on a page saying there's nothing yet", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  renderApp("/");

  expect(await screen.findByText(/There's nothing to explore yet/)).toBeDefined();
  expect(window.location.pathname).toBe("/");
});
