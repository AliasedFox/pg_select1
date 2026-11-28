import type { Endpoint } from "../endpoint";
import type { Job } from "../job";
import { endpoints as connection } from "./connection/api";
import { endpoints as dashboard } from "./dashboard/api";
import { endpoints as explore } from "./explore/api";
import { refreshCatalogsJob } from "./explore/catalog";
import { endpoints as health } from "./health/api";
import { endpoints as query } from "./query/api";
import { endpoints as settings } from "./settings/api";
import { endpoints as user } from "./user/api";

/** Every module's endpoints, in the order they're mounted. */
export const endpoints: Endpoint[] = [
  ...health,
  ...user,
  ...connection,
  ...explore,
  ...query,
  ...dashboard,
  ...settings,
];

/** Every module's background jobs, which the API process works. */
export const jobs: Job[] = [refreshCatalogsJob];
