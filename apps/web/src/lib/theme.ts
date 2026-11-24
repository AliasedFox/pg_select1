// Light or dark: the one picked in the header's switch, or the system's (the default), light when
// the system doesn't say. It's kept on the device, so the script in index.html can apply it before
// the first paint; keep the two in step.

/** The themes to pick from, the system's first since it's the default. */
export const THEMES = ["system", "light", "dark"] as const;

/** A theme to pick: the system's, or light or dark whatever the system says. */
export type Theme = (typeof THEMES)[number];

/** Where the picked theme is kept on the device. */
export const THEME_STORAGE_KEY = "pg_select1.theme";

// The page's background in each theme (--background in index.css), for the browser's own UI.
const THEME_COLORS = { light: "#ffffff", dark: "#0a0a0a" };

/** Answers whether a value, as kept in storage or picked in a radio group, is a theme. */
export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

const systemDarkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Answers the theme picked on this device, or `system`. Storage can be blocked, as in some private windows. */
export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Answers whether a theme shows dark, given whether the system asks for dark. */
export function isDark(theme: Theme, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

function applyTheme(theme: Theme) {
  const dark = isDark(theme, systemDarkQuery().matches);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[dark ? "dark" : "light"]);
}

/** Shows a theme, and keeps it on the device for the next visit and the other tabs. */
export function showTheme(theme: Theme): void {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Shown, just not kept.
  }
  applyTheme(theme);
}

/**
 * Shows the theme kept on the device, then keeps the page in step with the system's setting and
 * with a theme picked in another tab. Call it once, at start-up.
 */
export function followTheme(): void {
  applyTheme(storedTheme());
  systemDarkQuery().addEventListener("change", () => {
    applyTheme(storedTheme());
  });
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY) applyTheme(storedTheme());
  });
}
