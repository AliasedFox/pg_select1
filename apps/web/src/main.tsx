import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { followTheme } from "./lib/theme";

import "./index.css";

followTheme();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
