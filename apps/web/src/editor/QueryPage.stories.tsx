import { delay, http, HttpResponse } from "msw";

import preview from "../../.storybook/preview";
import { QueryPage } from "./QueryPage";

const meta = preview.meta({
  title: "Editor/QueryPage",
  component: QueryPage,
  args: { isAdmin: true },
});

export const Default = meta.story();

export const OneDatabase = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("/api/explore/connections", () =>
        HttpResponse.json({
          connections: [{ id: "0199a1b2-0000-7000-8000-0000000000c2", name: "shop" }],
        }),
      ),
    );
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
