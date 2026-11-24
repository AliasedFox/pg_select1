import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { followTheme } from "./lib/theme";

import "./index.css";

// How long the first render waits for the fonts before going ahead in the fallbacks.
const FONT_TIMEOUT = 1000;

// Loads Geist and Geist Mono, which the browser would otherwise fetch only once text needs them,
// drawing that text in a system font until they arrive. Resolves either way, after FONT_TIMEOUT
// at most, so a slow or failed download never keeps the page from showing.
function loadFonts(): Promise<unknown> {
  const fonts = Promise.all([
    document.fonts.load('1em "Geist Variable"'),
    document.fonts.load('1em "Geist Mono Variable"'),
  ]).catch(() => undefined);
  return Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT))]);
}

followTheme();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

void loadFonts().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
