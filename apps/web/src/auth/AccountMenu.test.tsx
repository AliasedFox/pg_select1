import { afterEach, expect, test } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { THEME_STORAGE_KEY, showTheme } from "@/lib/theme";

import { admin } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

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

test("switches the theme, saves it on the account and the device, and stays open", async () => {
  const sent: unknown[] = [];
  server.use(
    http.patch("/api/me", async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json(admin);
    }),
  );
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
  await waitFor(() => {
    expect(sent).toEqual([{ theme: "dark" }, { theme: "light" }]);
  });
});

test("shows the theme saved on the account, over the one kept on the device", async () => {
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  server.use(http.get("/api/me", () => HttpResponse.json({ ...admin, theme: "dark" })));
  const user = userEvent.setup();
  renderApp("/connections");

  expect(checked(await openThemes(user), "Dark")).toBe(true);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
});
