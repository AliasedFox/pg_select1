import { http, HttpResponse } from "msw";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { settings } from "../../test/fixtures";
import { CatalogSetting, ChoiceSetting, SettingsLayout, SettingsPage } from "./SettingsPage";

const meta = preview.meta({
  title: "Settings/SettingsPage",
  component: SettingsPage,
});

export const Default = meta.story();

export const EveryDay = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/settings", () => HttpResponse.json({ catalogRefreshMinutes: 1440 })));
  },
});

export const CouldNotLoad = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("/api/settings", () => HttpResponse.error()));
  },
});

// The page as it would be with more settings than there are yet: the real one first, then two
// made up for the layout, each a card of its own with its own Save.
export const WithMoreSettings = meta.story({
  render: () => (
    <SettingsLayout>
      <CatalogSetting settings={settings} onSaved={fn()} />
      <ChoiceSetting
        id="history-days"
        title="Query history"
        description="Every query someone runs is kept in their history, to open again from the explorer, for this long."
        label="Keep history for"
        choices={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
        ]}
        value="30"
        onSave={fn(() => Promise.resolve("History is kept for 90 days."))}
      />
      <ChoiceSetting
        id="row-cap"
        title="Row cap"
        description="The most rows a query answers with, in the explorer and on dashboards, whatever its SQL asks for."
        label="At most"
        hint="More rows take longer to send and to show."
        choices={[
          { value: "1000", label: "1,000 rows" },
          { value: "10000", label: "10,000 rows" },
          { value: "100000", label: "100,000 rows" },
        ]}
        value="10000"
        onSave={fn(() => Promise.reject(new Error("Couldn't save the row cap")))}
      />
    </SettingsLayout>
  ),
});
