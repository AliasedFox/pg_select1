import { expect, test } from "bun:test";

import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { unhealthyResponse } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("shows the API and database as ok when /health says so", async () => {
  renderApp("/");

  expect(await screen.findAllByText("ok")).toHaveLength(2);
  expect(screen.getByText("3 ms")).toBeDefined();
});

test("shows the database as down when /health answers 503", async () => {
  server.use(http.get("/health", () => HttpResponse.json(unhealthyResponse, { status: 503 })));
  renderApp("/");

  expect(await screen.findAllByText("down")).toHaveLength(2);
});

test("says so when the API can't be reached", async () => {
  server.use(http.get("/health", () => HttpResponse.error()));
  renderApp("/");

  const alert = await screen.findByRole("alert");
  expect(within(alert).getByText(/Couldn't reach the API/)).toBeDefined();
});
