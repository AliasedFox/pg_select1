import { expect, test } from "bun:test";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { signedOut, viewer } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

test("goes to the admins' pages from the footer", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  const footer = await screen.findByRole("navigation", { name: "Footer" });
  await user.click(within(footer).getByRole("link", { name: "Users" }));
  expect(await screen.findByRole("heading", { name: "Users" })).toBeDefined();
  expect(window.location.pathname).toBe("/users");
});

test("goes to the explorer from the footer, admin or not", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  const user = userEvent.setup();
  renderApp("/profile");

  const footer = await screen.findByRole("navigation", { name: "Footer" });
  await user.click(within(footer).getByRole("link", { name: "Explore" }));
  expect(await screen.findByRole("heading", { name: "Explore" })).toBeDefined();
  expect(window.location.pathname).toBe("/explore");
});

test("goes to one's profile from the footer, admin or not", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  const user = userEvent.setup();
  renderApp("/");

  const footer = await screen.findByRole("navigation", { name: "Footer" });
  await user.click(await within(footer).findByRole("link", { name: "Your profile" }));
  expect(await screen.findByRole("heading", { name: "Your profile" })).toBeDefined();
  expect(window.location.pathname).toBe("/profile");
});

test("shows someone who isn't an admin their profile and the project's links", async () => {
  server.use(http.get("/api/me", () => HttpResponse.json(viewer)));
  renderApp("/");

  await screen.findByRole("heading", { name: "Explore" });
  const footer = screen.getByRole("navigation", { name: "Footer" });
  expect(within(footer).queryByRole("link", { name: "Connections" })).toBeNull();
  expect(within(footer).getByRole("link", { name: "Your profile" })).toBeDefined();
  expect(within(footer).getByRole("link", { name: "Source on GitHub" }).getAttribute("href")).toBe(
    "https://github.com/AliasedFox/pg_select1",
  );
});

test("shows the project's links to nobody signed in", async () => {
  server.use(signedOut);
  renderApp("/");

  await screen.findByRole("button", { name: /Sign in/ });
  const footer = screen.getByRole("navigation", { name: "Footer" });
  expect(within(footer).getByRole("link", { name: "Report an issue" })).toBeDefined();
  expect(within(footer).queryByRole("link", { name: "Users" })).toBeNull();
  expect(within(footer).queryByRole("link", { name: "Your profile" })).toBeNull();
});

test("goes to the dashboards from the footer", async () => {
  const user = userEvent.setup();
  renderApp("/explore");

  const footer = await screen.findByRole("navigation", { name: "Footer" });
  await user.click(within(footer).getByRole("link", { name: "Dashboards" }));
  expect(await screen.findByRole("heading", { name: "Dashboards" })).toBeDefined();
  expect(window.location.pathname).toBe("/dashboards");
});

test("opens the pages about pg_select1 from the footer, signed in or not", async () => {
  server.use(signedOut);
  const user = userEvent.setup();
  renderApp("/");

  await screen.findByRole("button", { name: /Sign in/ });
  const footer = screen.getByRole("navigation", { name: "Footer" });
  expect(
    within(footer)
      .getAllByRole("link")
      .map((link) => link.textContent)
      .filter((label) => ["FAQ", "Support", "Careers", "About pg_select1"].includes(label)),
  ).toEqual(["FAQ", "Support", "Careers", "About pg_select1"]);
  await user.click(within(footer).getByRole("link", { name: "About pg_select1" }));
  expect(await screen.findByRole("heading", { name: "About pg_select1" })).toBeDefined();
  expect(window.location.pathname).toBe("/about");
});
