import { render, type RenderResult } from "@testing-library/react";

import { App } from "../src/App";

/** Renders the whole web app at a path, as a person landing on that URL would see it. */
export function renderApp(path = "/"): RenderResult {
  window.history.replaceState(null, "", path);
  return render(<App />);
}
