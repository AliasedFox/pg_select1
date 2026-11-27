import { http, HttpResponse } from "msw";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { admin, savedQueries, viewer } from "../../test/fixtures";
import { SavedQueriesPage } from "./SavedQueriesPage";
import { SaveQueryDialog } from "./SavedQueryDialogs";

const meta = preview.meta({
  title: "Queries/SavedQueriesPage",
  component: SavedQueriesPage,
  args: { user: admin },
});

export const Default = meta.story();

export const Empty = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/saved-queries", () => HttpResponse.json({ savedQueries: [] })));
  },
});

// Each query's result shown its own way: as a line chart, a number and a table.
export const ShownAs = meta.story({
  beforeEach({ msw }) {
    const [daily, open, unpaid] = savedQueries;
    msw.use(
      http.get("/api/saved-queries", () =>
        HttpResponse.json({
          savedQueries: [
            { ...daily, display: { type: "chart", kind: "line" } },
            { ...open, display: { type: "number" } },
            unpaid,
          ],
        }),
      ),
    );
  },
});

// A viewer can change only their own queries, here none.
export const ForAViewer = meta.story({
  args: { user: viewer },
  beforeEach({ msw }) {
    msw.use(
      http.get("/api/saved-queries", () =>
        HttpResponse.json({
          savedQueries: savedQueries
            .filter((q) => q.scope === "global")
            .map((q) => ({ ...q, canEdit: false })),
        }),
      ),
    );
  },
});

export const CouldNotLoad = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/saved-queries", () => HttpResponse.error()));
  },
});

export const SaveDialog = meta.story({
  render: () => (
    <SaveQueryDialog
      user={admin}
      sql="select 1"
      connectionId="0199a1b2-0000-7000-8000-0000000000c2"
      display={{ type: "table" }}
      onOpenChange={fn()}
      onSaved={fn()}
    />
  ),
});

export const SaveDialogForAViewer = meta.story({
  render: () => (
    <SaveQueryDialog
      user={viewer}
      sql="select 1"
      connectionId="0199a1b2-0000-7000-8000-0000000000c2"
      display={{ type: "table" }}
      onOpenChange={fn()}
      onSaved={fn()}
    />
  ),
});
