import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

import "./index.css";

// Follow the system's light or dark setting until there's one in settings.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
