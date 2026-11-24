import { expect, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview";
import { admin } from "../../test/fixtures";
import { AccountMenu } from "./AccountMenu";
import { SessionProvider } from "./SessionProvider";

const meta = preview.meta({
  title: "Auth/AccountMenu",
  component: AccountMenu,
  args: { user: admin },
  decorators: [
    (Story) => (
      <SessionProvider>
        <div className="flex justify-end">
          <Story />
        </div>
      </SessionProvider>
    ),
  ],
});

export const Closed = meta.story();

export const Open = meta.story({
  async play({ canvasElement }) {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Account menu" }));
    await expect(await within(document.body).findByRole("menu")).toBeVisible();
  },
});
