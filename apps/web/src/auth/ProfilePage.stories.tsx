import { http, HttpResponse } from "msw";

import preview from "../../.storybook/preview";
import { admin, viewer } from "../../test/fixtures";
import { ProfilePage } from "./ProfilePage";
import { SessionProvider } from "./SessionProvider";

const meta = preview.meta({
  title: "Auth/ProfilePage",
  component: ProfilePage,
  args: { user: admin },
  decorators: [
    (Story) => (
      <SessionProvider>
        <Story />
      </SessionProvider>
    ),
  ],
});

export const Default = meta.story();

export const Viewer = meta.story({ args: { user: viewer } });

export const WrongCurrentPassword = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/auth/change-password", () =>
        HttpResponse.json(
          { message: "Invalid password", code: "INVALID_PASSWORD" },
          { status: 400 },
        ),
      ),
    );
  },
});
