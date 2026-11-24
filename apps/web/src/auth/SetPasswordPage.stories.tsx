import { http, HttpResponse } from "msw";

import preview from "../../.storybook/preview";
import { SetPasswordPage } from "./SetPasswordPage";

const meta = preview.meta({
  title: "Auth/SetPasswordPage",
  component: SetPasswordPage,
  args: { token: "fake-token" },
});

export const Default = meta.story();

export const ExpiredLink = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json({ message: "Invalid token", code: "INVALID_TOKEN" }, { status: 400 }),
      ),
    );
  },
});

export const MissingToken = meta.story({ args: { token: null } });
