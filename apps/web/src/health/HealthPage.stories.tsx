import { http, HttpResponse } from "msw";

import preview from "../../.storybook/preview";
import { unhealthyResponse } from "../../test/fixtures";
import { HealthPage } from "./HealthPage";

const meta = preview.meta({
  title: "Health/HealthPage",
  component: HealthPage,
});

export const Healthy = meta.story();

export const DatabaseDown = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/health", () => HttpResponse.json(unhealthyResponse, { status: 503 })));
  },
});

export const ApiUnreachable = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/health", () => HttpResponse.error()));
  },
});
