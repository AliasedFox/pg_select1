import { http, HttpResponse } from "msw";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { admin, dashboardSummaries, viewer } from "../../test/fixtures";
import { NewDashboardDialog } from "./DashboardDialogs";
import { DashboardsPage } from "./DashboardsPage";

const meta = preview.meta({
  title: "Dashboards/DashboardsPage",
  component: DashboardsPage,
  args: { user: admin },
});

export const Default = meta.story();

export const Empty = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/dashboards", () => HttpResponse.json({ dashboards: [] })));
  },
});

// A viewer can change only their own dashboards, here none.
export const ForAViewer = meta.story({
  args: { user: viewer },
  beforeEach({ msw }) {
    msw.use(
      http.get("/api/dashboards", () =>
        HttpResponse.json({
          dashboards: dashboardSummaries
            .filter((d) => d.scope === "global")
            .map((d) => ({ ...d, canEdit: false })),
        }),
      ),
    );
  },
});

export const CouldNotLoad = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/dashboards", () => HttpResponse.error()));
  },
});

export const NewDialog = meta.story({
  render: () => <NewDashboardDialog user={admin} onOpenChange={fn()} onCreated={fn()} />,
});
