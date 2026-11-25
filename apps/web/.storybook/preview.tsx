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

// A user agent for each platform the toolbar switches between, for the hints that name a key: ⌘
// on a Mac, Ctrl on Windows. What the browser says is kept for "system".
const userAgents = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
};
const systemUserAgent = navigator.userAgent;

const withPlatform: Decorator = (Story, { globals }) => {
  const platform: unknown = globals.platform;
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: platform === "mac" || platform === "windows" ? userAgents[platform] : systemUserAgent,
  });
  return <Story />;
};

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
    withPlatform,
  ],
  globalTypes: {
    platform: {
      description: "The platform whose keys hints name",
      toolbar: {
        title: "Platform",
        icon: "browser",
        items: [
          { value: "system", title: "This computer's" },
          { value: "mac", title: "Mac (⌘)" },
          { value: "windows", title: "Windows (Ctrl)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { platform: "system" },
  parameters: {
    a11y: { test: "error" },
  },
});
