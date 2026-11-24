import { afterEach, describe, expect, test } from "bun:test";

import { isDark, showTheme, storedTheme, THEME_STORAGE_KEY } from "./theme";

afterEach(() => {
  showTheme("system");
});

describe("theme", () => {
  test("follows the system unless one was picked", () => {
    expect(isDark("system", true)).toBe(true);
    expect(isDark("system", false)).toBe(false);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("dark", false)).toBe(true);
  });

  test("keeps the theme picked on the device, but not system, the default", () => {
    expect(storedTheme()).toBe("system");
    showTheme("dark");
    expect(storedTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    showTheme("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("ignores anything else stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(storedTheme()).toBe("system");
  });
});
