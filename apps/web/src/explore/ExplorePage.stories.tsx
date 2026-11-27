import { type ChartKind, runQueryRequest, type TableRows } from "@pg_select1/shared";
import { delay, http, HttpResponse } from "msw";
import { useState } from "react";

import { ResultChart } from "@/components/ResultChart";
import { ResultNumber } from "@/components/ResultNumber";
import { RowsGrid } from "@/components/RowsGrid";

import preview from "../../.storybook/preview";
import { admin, customerRows, savedQueries, viewer } from "../../test/fixtures";
import { ExplorePage } from "./ExplorePage";
import { HistoryDialog } from "./HistoryDialog";

const meta = preview.meta({
  title: "Explore/ExplorePage",
  component: ExplorePage,
  args: { user: admin },
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

// The hint names Ctrl rather than ⌘, as on Windows and Linux.
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

// Opens a saved query from the address, as its link from the saved queries does, and puts the
// address back after.
function withAddress(search: Record<string, string>) {
  return () => {
    const before = window.location.href;
    const url = new URL(before);
    for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
    window.history.replaceState(null, "", url);
    return () => {
      window.history.replaceState(null, "", before);
    };
  };
}

export const SavedQueryOpen = meta.story({
  beforeEach: withAddress({ connection: "shop", query: savedQueries[0]?.id ?? "" }),
});

// Someone else's global query, for a viewer: it can only be saved as their own.
export const SavedQueryReadOnly = meta.story({
  args: { user: viewer },
  beforeEach(context) {
    context.msw.use(
      http.get("/api/saved-queries/:id", () =>
        HttpResponse.json({ ...savedQueries[0], canEdit: false }),
      ),
    );
    return withAddress({ connection: "shop", query: savedQueries[0]?.id ?? "" })();
  },
});

export const NoDatabases = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/explore/connections", () => HttpResponse.json({ connections: [] })));
  },
});

export const NoDatabasesForAViewer = meta.story({
  args: { user: viewer },
  beforeEach({ msw }) {
    msw.use(http.get("/api/explore/connections", () => HttpResponse.json({ connections: [] })));
  },
});

// Versions of the SQL kept as it was written, the newest the one in the editor.
const versions = [
  {
    id: 3,
    sql: "select c.email, count(*) as orders\nfrom customers c\njoin orders o on o.customer_id = c.id\ngroup by c.email\norder by orders desc\nlimit 20",
    at: new Date("2026-11-26T10:42:18"),
  },
  {
    id: 2,
    sql: "select c.email, count(*)\nfrom customers c\njoin orders o on o.customer_id = c.id\ngroup by c.email",
    at: new Date("2026-11-26T10:40:03"),
  },
  { id: 1, sql: 'select * from "public"."customers"', at: new Date("2026-11-26T10:37:51") },
];

export const History = meta.story({
  render: () => (
    <HistoryDialog
      entries={versions}
      current={versions[0]?.sql ?? ""}
      onRestore={() => undefined}
      focusAfterRestore={() => undefined}
      onOpenChange={() => undefined}
    />
  ),
});

// A customer's row of the wide table below, by its number from 1.
function customer(n: number): (string | null)[] {
  return [
    String(n),
    `customer${n}@example.com`,
    n % 7 === 0 ? null : `Customer ${n}`,
    "2026-01-02 09:00:00+00",
    n % 3 === 0 ? "Prefers deliveries in the morning, and asks to ring the bell twice." : null,
    "{vip,newsletter}",
    '{"theme": "dark", "language": "en"}',
  ];
}

// A wide table with many rows, long values and NULLs, to scroll down the page and sideways.
const manyRows: TableRows = {
  columns: [
    ...customerRows.columns,
    { name: "notes", type: "text" },
    { name: "tags", type: "text[]" },
    { name: "settings", type: "jsonb" },
  ],
  rows: Array.from({ length: 1000 }, (_, i) => customer(i + 1)),
  truncated: true,
  rowCap: 200,
};

// How many customers the query in ManyRows has, in pages of 200.
const CUSTOMERS = 1000;

export const Rows = meta.story({
  render: () => (
    // Room for the app's header, which the grid's own stays below as the page scrolls.
    <div className="pt-14">
      <RowsGrid data={manyRows} label="public.customers" />
    </div>
  ),
});

// Any query answers a thousand rows, 200 at a time as the page scrolls down past the list of
// tables, each page after a moment.
export const ManyRows = meta.story({
  beforeEach({ msw }) {
    msw.use(
      oneDatabase,
      http.post("/api/explore/connections/:id/query", async ({ request }) => {
        const { offset = 0 } = runQueryRequest.parse(await request.json());
        if (offset > 0) await delay(500);
        const count = Math.min(200, CUSTOMERS - offset);
        return HttpResponse.json({
          ...manyRows,
          rows: Array.from({ length: count }, (_, i) => customer(offset + i + 1)),
          truncated: offset + count < CUSTOMERS,
          durationMs: 12,
        });
      }),
    );
  },
});

// Signups and churned customers on each day of November: a series for each column of numbers.
const signups: TableRows = {
  columns: [
    { name: "day", type: "date" },
    { name: "signups", type: "bigint" },
    { name: "churned", type: "bigint" },
  ],
  rows: Array.from({ length: 30 }, (_, i) => {
    const count = 40 + Math.round(30 * Math.sin(i / 3)) + (i % 7) * 4;
    const churned = 12 + Math.round(6 * Math.cos(i / 4)) + (i % 5);
    return [`2026-11-${String(i + 1).padStart(2, "0")}`, String(count), String(churned)];
  }),
  truncated: false,
  rowCap: 200,
};

// What was paid each month of 2026 by each method, a row for each, as `group by 1, 2` has it:
// the methods split the totals into series, stacked. Checks stop in October, so they're 0 after.
const paymentsByMethod: TableRows = {
  columns: [
    { name: "month", type: "date" },
    { name: "method", type: "text" },
    { name: "total", type: "numeric(12,2)" },
  ],
  rows: Array.from({ length: 11 }, (_, i) => {
    const month = `2026-${String(i + 1).padStart(2, "0")}-01`;
    const rows = [
      [month, "card", (42000 + i * 2600).toFixed(2)],
      [month, "transfer", (18000 + 900 * Math.sin(i)).toFixed(2)],
    ];
    return i < 9 ? [...rows, [month, "check", (6000 - i * 500).toFixed(2)]] : rows;
  }).flat(),
  truncated: false,
  rowCap: 200,
};

// A chart of `data`, starting as `initial`, whose toggle changes its kind.
function ChartOf({ data, initial = "bar" }: { data: TableRows; initial?: ChartKind }) {
  const [kind, setKind] = useState(initial);
  return <ResultChart data={data} kind={kind} onKindChange={setKind} />;
}

export const Chart = meta.story({
  render: () => <ChartOf data={signups} />,
});

export const StackedChart = meta.story({
  render: () => <ChartOf data={paymentsByMethod} />,
});

export const StackedAreaChart = meta.story({
  render: () => <ChartOf data={paymentsByMethod} initial="area" />,
});

export const LineChart = meta.story({
  render: () => <ChartOf data={signups} initial="line" />,
});

export const AreaChart = meta.story({
  render: () => <ChartOf data={signups} initial="area" />,
});

// Orders by status, more of them than a pie has slices, so the smallest are added up as Other.
const ordersByStatus: TableRows = {
  columns: [
    { name: "status", type: "text" },
    { name: "orders", type: "bigint" },
  ],
  rows: [
    ["paid", "412"],
    ["shipped", "268"],
    ["pending", "131"],
    ["refunded", "54"],
    ["cancelled", "37"],
    ["on_hold", "22"],
    ["disputed", "9"],
    ["failed", "6"],
    ["draft", "3"],
    [null, "2"],
  ],
  truncated: false,
  rowCap: 200,
};

export const PieChart = meta.story({
  render: () => <ChartOf data={ordersByStatus} initial="pie" />,
});

// The customers have no column of numbers after their id, the first, so there's nothing to chart.
export const ChartWithoutNumbers = meta.story({
  render: () => <ChartOf data={customerRows} />,
});

export const NumberResult = meta.story({
  render: () => (
    <ResultNumber
      data={{
        columns: [{ name: "revenue", type: "numeric" }],
        rows: [["1234567.50"]],
        truncated: false,
        rowCap: 200,
      }}
    />
  ),
});
