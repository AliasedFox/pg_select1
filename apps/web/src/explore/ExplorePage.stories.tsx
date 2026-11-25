import type { TableRows } from "@pg_select1/shared";
import { delay, http, HttpResponse } from "msw";

import { RowsGrid } from "@/components/RowsGrid";

import preview from "../../.storybook/preview";
import { customerRows } from "../../test/fixtures";
import { ExplorePage } from "./ExplorePage";

const meta = preview.meta({
  title: "Explore/ExplorePage",
  component: ExplorePage,
  args: { isAdmin: true },
});

export const Default = meta.story();

// Only shop to explore, so it's picked already and its tables are listed.
const oneDatabase = http.get("/api/explore/connections", () =>
  HttpResponse.json({
    connections: [{ id: "0199a1b2-0000-7000-8000-0000000000c2", name: "shop" }],
  }),
);

export const OneDatabase = meta.story({
  beforeEach({ msw }) {
    msw.use(oneDatabase);
  },
});

// The hints name Ctrl rather than ⌘, as on Windows and Linux.
export const OnWindows = meta.story({
  globals: { platform: "windows" },
  beforeEach({ msw }) {
    msw.use(oneDatabase);
  },
});

export const SlowQuery = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/explore/connections/:id/query", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
  },
});

export const FailingQuery = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/explore/connections/:id/query", () =>
        HttpResponse.json({ error: 'syntax error at or near "selec"' }, { status: 502 }),
      ),
    );
  },
});

export const NoDatabases = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/explore/connections", () => HttpResponse.json({ connections: [] })));
  },
});

export const NoDatabasesForAViewer = meta.story({
  args: { isAdmin: false },
  beforeEach({ msw }) {
    msw.use(http.get("/api/explore/connections", () => HttpResponse.json({ connections: [] })));
  },
});

// A wide table with many rows, long values and NULLs, to scroll down the page and sideways.
const manyRows: TableRows = {
  columns: [
    ...customerRows.columns,
    { name: "notes", type: "text" },
    { name: "tags", type: "text[]" },
    { name: "settings", type: "jsonb" },
  ],
  rows: Array.from({ length: 1000 }, (_, i) => [
    String(i + 1),
    `customer${i + 1}@example.com`,
    i % 7 === 0 ? null : `Customer ${i + 1}`,
    "2026-01-02 09:00:00+00",
    i % 3 === 0 ? "Prefers deliveries in the morning, and asks to ring the bell twice." : null,
    "{vip,newsletter}",
    '{"theme": "dark", "language": "en"}',
  ]),
  truncated: true,
  rowCap: 1000,
};

export const Rows = meta.story({
  render: () => (
    // Room for the app's header, which the grid's own stays below as the page scrolls.
    <div className="pt-14">
      <RowsGrid data={manyRows} label="public.customers" />
    </div>
  ),
});

// Any query answers a thousand rows, which run down the page past the list of tables.
export const ManyRows = meta.story({
  beforeEach({ msw }) {
    msw.use(
      oneDatabase,
      http.post("/api/explore/connections/:id/query", () =>
        HttpResponse.json({ ...manyRows, durationMs: 12 }),
      ),
    );
  },
});
