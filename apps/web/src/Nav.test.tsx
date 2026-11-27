import { expect, test } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "../test/render";

test("goes to the admins' pages from the Admin menu", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  await user.click(await screen.findByRole("button", { name: "Admin" }));
  const menu = await screen.findByRole("menu");
  expect(
    within(menu)
      .getByRole("menuitem", { name: /Connections/ })
      .getAttribute("aria-current"),
  ).toBe("page");

  await user.click(within(menu).getByRole("menuitem", { name: /Users/ }));
  expect(await screen.findByRole("heading", { name: "Users" })).toBeDefined();
  expect(window.location.pathname).toBe("/users");
  // The menu closes once a page is picked from it.
  await waitFor(() => {
    expect(screen.queryByRole("menu")).toBeNull();
  });
  expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-current")).toBe("page");
});

test("goes to the pages about pg_select1 from the Resources menu", async () => {
  const user = userEvent.setup();
  renderApp("/explore");

  await user.click(await screen.findByRole("button", { name: "Resources" }));
  const menu = await screen.findByRole("menu");
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.querySelector(".font-medium")?.textContent),
  ).toEqual(["FAQ", "Support", "Careers", "About pg_select1"]);

  await user.click(within(menu).getByRole("menuitem", { name: /FAQ/ }));
  expect(await screen.findByRole("heading", { name: "FAQ" })).toBeDefined();
  expect(window.location.pathname).toBe("/faq");
  expect(screen.getByRole("button", { name: "Resources" }).getAttribute("aria-current")).toBe(
    "page",
  );
});
