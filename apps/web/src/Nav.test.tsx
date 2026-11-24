import { expect, test } from "bun:test";

import { screen, within } from "@testing-library/react";
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
  expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-current")).toBe("page");
});
