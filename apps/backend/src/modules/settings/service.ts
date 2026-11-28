import {
  DEFAULT_CATALOG_REFRESH_MINUTES,
  type Settings,
  type updateSettingsRequest,
} from "@pg_select1/shared";
import type { z } from "zod";

import { db } from "../../db";

// The one row's key: the table's check lets no other in.
const ID = 1;

/**
 * Answers pg_select1's settings: those an admin changed, and the defaults for the rest, which are
 * all of them until one is first changed.
 */
export async function readSettings(): Promise<Settings> {
  const row = await db.orm.public.Setting.select("catalogRefreshMinutes").first({ id: ID });
  return row ?? { catalogRefreshMinutes: DEFAULT_CATALOG_REFRESH_MINUTES };
}

/**
 * Changes the settings `changes` gives, keeping the others, and answers them all. Only saves
 * them: what goes by a setting, like a job's schedule, is changed by whoever calls this.
 */
export async function updateSettings(
  changes: z.output<typeof updateSettingsRequest>,
): Promise<Settings> {
  // Only the fields given, so one left out keeps what it was.
  const { catalogRefreshMinutes } = changes;
  const update = catalogRefreshMinutes === undefined ? {} : { catalogRefreshMinutes };
  return db.orm.public.Setting.select("catalogRefreshMinutes").upsert({
    create: { id: ID, ...update },
    update,
  });
}
