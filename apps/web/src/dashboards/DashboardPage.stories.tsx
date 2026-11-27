import { delay, http, HttpResponse } from "msw";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { admin, dashboards, viewer } from "../../test/fixtures";
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
