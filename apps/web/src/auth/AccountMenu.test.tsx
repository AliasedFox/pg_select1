import { afterEach, expect, test } from "bun:test";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { THEME_STORAGE_KEY, showTheme } from "@/lib/theme";

import { admin } from "../../test/fixtures";
import { renderApp } from "../../test/render";

afterEach(() => {
  showTheme("system");
});

// Opens the account menu, and returns its theme switch.
async function openThemes(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Account menu" }));
  return screen.findByRole("group", { name: "Theme" });
}

const checked = (themes: HTMLElement, name: string) =>
  within(themes).getByRole("menuitemradio", { name }).getAttribute("aria-checked") === "true";

test("shows who's signed in", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  await openThemes(user);
  const menu = screen.getByRole("menu");
  expect(within(menu).getByText(admin.name)).toBeDefined();
  expect(within(menu).getByText(admin.email)).toBeDefined();
});

test("switches the theme, keeps it on the device, and stays open", async () => {
  const user = userEvent.setup();
  renderApp("/connections");

  const themes = await openThemes(user);
  expect(checked(themes, "System")).toBe(true);

  await user.click(within(themes).getByRole("menuitemradio", { name: "Dark" }));
  expect(checked(themes, "Dark")).toBe(true);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

  await user.click(within(themes).getByRole("menuitemradio", { name: "Light" }));
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  expect(screen.getByRole("menu")).toBeDefined();
});

test("shows the theme picked before", async () => {
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  const user = userEvent.setup();
  renderApp("/connections");

  expect(checked(await openThemes(user), "Dark")).toBe(true);
});
