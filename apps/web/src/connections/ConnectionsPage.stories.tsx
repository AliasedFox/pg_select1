import { http, HttpResponse } from "msw";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { connections } from "../../test/fixtures";
import { EditConnectionDialog } from "./ConnectionDialogs";
import { ConnectionsPage } from "./ConnectionsPage";

const meta = preview.meta({
  title: "Connections/ConnectionsPage",
  component: ConnectionsPage,
});

export const Default = meta.story();

export const NoConnections = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/connections", () => HttpResponse.json({ connections: [] })));
  },
});

export const CouldNotLoad = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/connections", () => HttpResponse.error()));
  },
});

export const EditConnection = meta.story({
  render: () => (
    <EditConnectionDialog connection={connections[0]!} onOpenChange={fn()} onSaved={fn()} />
  ),
});

export const TestFails = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/connections/test", () =>
        HttpResponse.json({ ok: false, error: "Nothing is accepting connections at db:5432" }),
      ),
    );
  },
  render: () => (
    <EditConnectionDialog connection={connections[0]!} onOpenChange={fn()} onSaved={fn()} />
  ),
});
