import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonThemes, { withThemeByClassName } from "@storybook/addon-themes";
import { type Decorator, definePreview } from "@storybook/react-vite";
import addonMsw from "msw-storybook-addon";
import { setupWorker } from "msw/browser";

import { handlers } from "../test/fixtures";

import "../src/index.css";

const withPage: Decorator = (Story) => (
  <div className="bg-background p-6 text-foreground">
    <Story />
  </div>
);

export default definePreview({
  addons: [
    addonDocs(),
    addonA11y(),
    addonThemes(),
    // Stories get the same fake API as the tests; a story overrides a route with `msw.use()`.
    addonMsw(async () => {
      const worker = setupWorker(...handlers);
      await worker.start({ onUnhandledRequest: "bypass", quiet: true });
      return worker;
    }),
  ],
  decorators: [
    withThemeByClassName({ themes: { light: "", dark: "dark" }, defaultTheme: "light" }),
    withPage,
  ],
  parameters: {
    a11y: { test: "error" },
  },
});
