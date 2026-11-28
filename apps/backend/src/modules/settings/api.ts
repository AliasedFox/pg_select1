import { updateSettingsRequest } from "@pg_select1/shared";

import { type Endpoint, parseRequest } from "../../endpoint";
import { scheduleCatalogRefresh } from "../explore/catalog";
import { readSettings, updateSettings } from "./service";

/**
 * pg_select1's settings, for admins only: reading them (`GET /api/settings`) and changing them
 * (`PATCH /api/settings`), which takes effect at once, as on how often the catalog is read.
 */
export const endpoints: Endpoint[] = [
  {
    method: "get",
    path: "/api/settings",
    access: "admin",
    handler: async (_req, res) => {
      res.json(await readSettings());
    },
  },
  {
    method: "patch",
    path: "/api/settings",
    access: "admin",
    handler: async (req, res) => {
      const settings = await updateSettings(parseRequest(updateSettingsRequest, req.body));
      await scheduleCatalogRefresh(settings.catalogRefreshMinutes);
      res.json(settings);
    },
  },
];
