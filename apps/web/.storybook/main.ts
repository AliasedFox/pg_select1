import { defineMain } from "@storybook/react-vite/node";

export default defineMain({
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    "msw-storybook-addon",
  ],
  // MSW's service worker lives here rather than in `public/`, so it never ships with the app.
  staticDirs: ["./public"],
  core: { disableTelemetry: true },
});
