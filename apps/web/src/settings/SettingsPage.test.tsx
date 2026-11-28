import { expect, test } from "bun:test";

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { signedOut, viewer } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("shows how often the catalog is read, from the Admin menu", async () => {
  renderApp("/settings");

  expect(await screen.findByRole("combobox", { name: "Read the catalog" })).toBeDefined();
  expect(screen.getByRole("combobox").textContent).toBe("Every 15 minutes");
  expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-current")).toBe("page");
});

test("changes how often the catalog is read", async () => {
  let sent: unknown;
  server.use(
    http.patch("/api/settings", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ catalogRefreshMinutes: 60 });
    }),
  );
  const user = userEvent.setup();
  renderApp("/settings");

  await user.click(await screen.findByRole("combobox", { name: "Read the catalog" }));
  await user.click(await screen.findByRole("option", { name: "Every hour" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("The catalog is read every hour.")).toBeDefined();
  expect(sent).toEqual({ catalogRefreshMinutes: 60 });
  expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
});

test("says why when the settings can't be saved", async () => {
  server.use(
    http.patch("/api/settings", () =>
      HttpResponse.json({ error: "Only admins can do that" }, { status: 403 }),
    ),
  );
  const user = userEvent.setup();
  renderApp("/settings");

  await user.click(await screen.findByRole("combobox", { name: "Read the catalog" }));
  await user.click(await screen.findByRole("option", { name: "Every 5 minutes" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect((await screen.findByRole("alert")).textContent).toBe("Only admins can do that");
});

test("is only for admins", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  renderApp("/settings");

  expect(await screen.findByText("Only admins can change settings.")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
});

test("signed out, asks to sign in", async () => {
  server.use(signedOut);
  renderApp("/settings");

  expect(await screen.findByRole("button", { name: "Sign in" })).toBeDefined();
});
