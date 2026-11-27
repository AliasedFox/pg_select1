import type {
  createDashboardRequest,
  Dashboard,
  DashboardItem,
  DashboardSummary,
  DashboardVisualization,
  QueryScope,
  updateDashboardRequest,
} from "@pg_select1/shared";
import { or } from "@prisma/orm-postgres/orm-client";
import type { z } from "zod";

import type { SessionUser } from "../../auth";
import { db } from "../../db";
import { HttpError } from "../../endpoint";
import { findVisibleSavedQueries } from "../query/service";

const dashboardFields = [
  "id",
  "name",
  "description",
  "scope",
  "ownerId",
  "createdAt",
  "updatedAt",
] as const;

interface DashboardRow {
  id: string;
  name: string;
  description: string | null;
  scope: QueryScope;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string } | null;
}

interface ItemRow {
  id: string;
  savedQueryId: string;
  visualization: DashboardVisualization;
}

type ItemsInput = z.output<typeof createDashboardRequest>["items"];

function dashboards() {
  return db.orm.public.Dashboard.select(...dashboardFields).include("owner", (owner) =>
    owner.select("id", "name"),
  );
}

// As for a saved query: a personal dashboard is its owner's alone, a global one everyone's.
function canSee(row: DashboardRow, user: SessionUser): boolean {
  return row.scope === "global" || row.ownerId === user.id;
}

// Its owner can change a dashboard; editors and admins can change any global one too.
function canEdit(row: DashboardRow, user: SessionUser): boolean {
  return row.ownerId === user.id || (row.scope === "global" && user.role !== "viewer");
}

function ensureCanShare(scope: QueryScope, user: SessionUser): void {
  if (scope === "global" && user.role === "viewer") {
    throw new HttpError(403, "Only editors and admins can share a dashboard with everyone");
  }
}

// The items of each dashboard in `ids`, first one first.
async function itemsOf(ids: readonly string[]): Promise<Map<string, ItemRow[]>> {
  const byDashboard = new Map<string, ItemRow[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return byDashboard;
  const rows = await db.orm.public.DashboardItem.select(
    "id",
    "dashboardId",
    "savedQueryId",
    "visualization",
  )
    .where((r) => r.dashboardId.in([...ids]))
    .orderBy((r) => r.position.asc())
    .all();
  for (const { dashboardId, ...item } of rows) byDashboard.get(dashboardId)?.push(item);
  return byDashboard;
}

function toSummary(row: DashboardRow, itemCount: number, user: SessionUser): DashboardSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    itemCount,
    owner: row.owner,
    canEdit: canEdit(row, user),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findVisible(id: string, user: SessionUser): Promise<DashboardRow> {
  const row = await dashboards().first({ id });
  // Someone else's personal dashboard is as good as missing.
  if (!row || !canSee(row, user)) throw new HttpError(404, "There's no such dashboard");
  return row;
}

async function answer(id: string, user: SessionUser): Promise<Dashboard> {
  const row = await findVisible(id, user);
  const items = (await itemsOf([id])).get(id) ?? [];
  const queries = await findVisibleSavedQueries(
    items.map((item) => item.savedQueryId),
    user,
  );
  return {
    ...toSummary(row, items.length, user),
    items: items.map((item): DashboardItem => ({
      ...item,
      savedQuery: queries.get(item.savedQueryId) ?? null,
    })),
  };
}

// Checks that `user` may put each query of `items` on a dashboard: one they see, or one that's
// on it already (`kept`), as someone else's personal query is, so it isn't lost when the
// dashboard is changed by someone else.
async function ensureCanAdd(
  items: ItemsInput,
  user: SessionUser,
  kept: ReadonlySet<string> = new Set(),
): Promise<void> {
  const added = items.map((item) => item.savedQueryId).filter((id) => !kept.has(id));
  const visible = await findVisibleSavedQueries(added, user);
  if (added.some((id) => !visible.has(id))) {
    throw new HttpError(404, "There's no such saved query");
  }
}

function itemRows(dashboardId: string, items: ItemsInput) {
  return items.map((item, position) => ({
    dashboardId,
    savedQueryId: item.savedQueryId,
    visualization: item.visualization,
    position,
  }));
}

/** Answers the dashboards `user` sees, by name: every global one, and their personal ones. */
export async function listDashboards(user: SessionUser): Promise<DashboardSummary[]> {
  const rows = await dashboards()
    .where((d) => or(d.scope.eq("global"), d.ownerId.eq(user.id)))
    .orderBy((d) => d.name.asc())
    .all();
  const items = await itemsOf(rows.map((r) => r.id));
  return rows.map((row) => toSummary(row, items.get(row.id)?.length ?? 0, user));
}

/**
 * Answers one dashboard `user` sees, with its queries in order.
 *
 * @throws {HttpError} a 404 when there's no such dashboard, or it's someone else's personal one.
 */
export async function getDashboard(id: string, user: SessionUser): Promise<Dashboard> {
  return answer(id, user);
}

/**
 * Makes a dashboard for `user`, with the saved queries in `input.items` on it, if any.
 *
 * @throws {HttpError} a 403 when a viewer shares it with everyone, and a 404 when a query isn't
 *   one `user` sees.
 */
export async function createDashboard(
  input: z.output<typeof createDashboardRequest>,
  user: SessionUser,
): Promise<Dashboard> {
  ensureCanShare(input.scope, user);
  await ensureCanAdd(input.items, user);
  const id = await db.transaction(async (tx) => {
    const created = await tx.orm.public.Dashboard.select("id").create({
      name: input.name,
      description: input.description ?? null,
      scope: input.scope,
      ownerId: user.id,
    });
    if (input.items.length > 0) {
      await tx.orm.public.DashboardItem.createAll(itemRows(created.id, input.items));
    }
    return created.id;
  });
  return answer(id, user);
}

/**
 * Changes a dashboard: its title, description, who sees it, or its queries, which `items`
 * replaces in the order given.
 *
 * @throws {HttpError} a 404 when `user` doesn't see it or a new query isn't one they see, and a
 *   403 when they can't change it, when someone other than its owner changes who sees it, and
 *   when a viewer shares it with everyone.
 */
export async function updateDashboard(
  id: string,
  changes: z.output<typeof updateDashboardRequest>,
  user: SessionUser,
): Promise<Dashboard> {
  const row = await findVisible(id, user);
  if (!canEdit(row, user)) {
    throw new HttpError(403, "Only its owner, or an editor or admin, can change this dashboard");
  }
  if (changes.scope !== undefined && changes.scope !== row.scope) {
    // Making it personal would hide it from everyone else, and only its owner could undo that.
    if (row.ownerId !== user.id) {
      throw new HttpError(403, "Only the user who made this dashboard can change who sees it");
    }
    ensureCanShare(changes.scope, user);
  }
  const { items } = changes;
  if (items) {
    const current = (await itemsOf([id])).get(id) ?? [];
    await ensureCanAdd(items, user, new Set(current.map((item) => item.savedQueryId)));
  }

  await db.transaction(async (tx) => {
    // Every field is written, so `updatedAt` moves even when only the queries change.
    await tx.orm.public.Dashboard.where({ id }).update({
      name: changes.name ?? row.name,
      description: changes.description === undefined ? row.description : changes.description,
      scope: changes.scope ?? row.scope,
    });
    if (items) {
      await tx.orm.public.DashboardItem.where({ dashboardId: id }).deleteAll();
      if (items.length > 0) await tx.orm.public.DashboardItem.createAll(itemRows(id, items));
    }
  });
  return answer(id, user);
}

/**
 * Deletes a dashboard. Its saved queries stay.
 *
 * @throws {HttpError} a 404 when `user` doesn't see it, and a 403 when they can't change it.
 */
export async function deleteDashboard(id: string, user: SessionUser): Promise<void> {
  const row = await findVisible(id, user);
  if (!canEdit(row, user)) {
    throw new HttpError(403, "Only its owner, or an editor or admin, can delete this dashboard");
  }
  // Its items go with it, by their foreign key's `ON DELETE CASCADE`.
  await db.orm.public.Dashboard.where({ id }).delete();
}
