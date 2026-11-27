import { runQueryRequest } from "@pg_select1/shared";
import { delay, http, HttpResponse } from "msw";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import {
  admin,
  dashboards,
  queryRows,
  savedQueries,
  signupRows,
  viewer,
} from "../../test/fixtures";
import { AddQueryDialog } from "./DashboardDialogs";
import { DashboardPage } from "./DashboardPage";

const [overview, weekly] = dashboards;

const meta = preview.meta({
  title: "Dashboards/DashboardPage",
  component: DashboardPage,
  args: { id: overview?.id ?? "", user: admin },
});

export const Default = meta.story();

export const Empty = meta.story({ args: { id: weekly?.id ?? "" } });

// Someone who can't change it sees its rows, and can run them again, but nothing else.
export const ForAViewer = meta.story({
  args: { user: viewer },
  beforeEach({ msw }) {
    msw.use(
      http.get("/api/dashboards/:id", () => HttpResponse.json({ ...overview, canEdit: false })),
    );
  },
});

// Each query shown as it was saved: a line chart of the daily signups, and the first customer's
// id.
export const ShownAsSaved = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/explore/connections/:id/query", async ({ request }) => {
        const { sql } = runQueryRequest.parse(await request.json());
        return HttpResponse.json(sql === savedQueries[0]?.sql ? signupRows : queryRows);
      }),
      http.get("/api/dashboards/:id", () =>
        HttpResponse.json({
          ...overview,
          items: overview?.items.map((item, index) =>
            item.savedQuery && index < 2
              ? {
                  ...item,
                  savedQuery: {
                    ...item.savedQuery,
                    display: index === 0 ? { type: "chart", kind: "line" } : { type: "number" },
                  },
                }
              : item,
          ),
        }),
      ),
    );
  },
});

// Numbers take a third of the width each: the first three share a row, the fourth starts the
// next, and the chart after it has a row of its own, as does the number after that.
export const Numbers = meta.story({
  beforeEach({ msw }) {
    const [signups, customers] = savedQueries;
    const number = (name: string, index: number) =>
      customers && {
        id: `0199a1b2-0000-7000-8000-00000000040${index}`,
        savedQueryId: customers.id,
        savedQuery: { ...customers, name, display: { type: "number" as const } },
      };
    msw.use(
      http.post("/api/explore/connections/:id/query", async ({ request }) => {
        const { sql } = runQueryRequest.parse(await request.json());
        return HttpResponse.json(sql === signups?.sql ? signupRows : queryRows);
      }),
      http.get("/api/dashboards/:id", () =>
        HttpResponse.json({
          ...overview,
          items: [
            number("Customers", 0),
            number("Orders today", 1),
            number("Waiting to ship", 2),
            number("Refunds", 3),
            signups && {
              id: "0199a1b2-0000-7000-8000-000000000404",
              savedQueryId: signups.id,
              savedQuery: { ...signups, display: { type: "chart", kind: "line" } },
            },
            number("Open tickets", 5),
          ],
        }),
      ),
    );
  },
});

export const Running = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/explore/connections/:id/query", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
  },
});

export const QueryFailed = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/explore/connections/:id/query", () =>
        HttpResponse.json({ error: 'relation "customers" does not exist' }, { status: 400 }),
      ),
    );
  },
});

export const NotFound = meta.story({ args: { id: "0199a1b2-0000-7000-8000-0000000000ff" } });

export const AddDialog = meta.story({
  render: () => <AddQueryDialog onOpenChange={fn()} onAdd={fn()} />,
});
