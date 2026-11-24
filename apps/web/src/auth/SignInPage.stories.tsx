import { http, HttpResponse } from "msw";

import preview from "../../.storybook/preview";
import { signedOut } from "../../test/fixtures";
import { SessionProvider } from "./SessionProvider";
import { SignInPage } from "./SignInPage";

const meta = preview.meta({
  title: "Auth/SignInPage",
  component: SignInPage,
  decorators: [
    (Story) => (
      <SessionProvider>
        <Story />
      </SessionProvider>
    ),
  ],
  beforeEach({ msw }) {
    msw.use(signedOut);
  },
});

export const Default = meta.story();

export const AfterSettingPassword = meta.story({
  args: { notice: "Your password is set. Sign in with it." },
});

export const WrongPassword = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post("/api/auth/sign-in/email", () =>
        HttpResponse.json({ message: "Invalid email or password" }, { status: 401 }),
      ),
    );
  },
});
