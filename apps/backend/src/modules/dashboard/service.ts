import type {
  createDashboardRequest,
  Dashboard,
  DashboardItem,
  DashboardSummary,
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
  "refreshMinutes",
  "ownerId",
  "createdAt",
  "updatedAt",
] as const;

interface DashboardRow {
  id: string;
  name: string;
  description: string | null;
  scope: QueryScope;
  refreshMinutes: number | null;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string } | null;
}

// A saved query on a dashboard, or a title: one of `savedQueryId` and `title`.
interface ItemRow {
  id: string;
  savedQueryId: string | null;
  title: string | null;
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
    "title",
  )
    .where((r) => r.dashboardId.in([...ids]))
    .orderBy((r) => r.position.asc())
    .all();
  for (const { dashboardId, ...item } of rows) byDashboard.get(dashboardId)?.push(item);
  return byDashboard;
}

// The ids of the saved queries among `items`, once for each time it's there.
function queryIds(items: readonly { savedQueryId?: string | null }[]): string[] {
  return items.flatMap((item) => (item.savedQueryId ? [item.savedQueryId] : []));
}

function toSummary(
  row: DashboardRow,
  items: readonly ItemRow[],
  user: SessionUser,
): DashboardSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    itemCount: queryIds(items).length,
    refreshMinutes: row.refreshMinutes,
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
  const queries = await findVisibleSavedQueries(queryIds(items), user);
  return {
    ...toSummary(row, items, user),
    items: items.map(({ id: itemId, savedQueryId, title }): DashboardItem =>
      savedQueryId
        ? {
            kind: "query",
            id: itemId,
            savedQueryId,
            savedQuery: queries.get(savedQueryId) ?? null,
          }
        : { kind: "title", id: itemId, title: title ?? "" },
    ),
  };
}

// Checks that `user` may put each query of `items` on a dashboard: one they see, or one that's
// on it already (`kept`), as someone else's personal query is, so it isn't lost when the
// dashboard is changed by someone else. Each query goes on once, but a dashboard from before
// that rule keeps as many of one as it has.
async function ensureCanAdd(
  items: ItemsInput,
  user: SessionUser,
  kept: readonly string[] = [],
): Promise<void> {
  const ids = queryIds(items);
  const allowed = new Map<string, number>();
  for (const id of kept) allowed.set(id, (allowed.get(id) ?? 0) + 1);
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > Math.max(1, allowed.get(id) ?? 0)) {
      throw new HttpError(400, "That query is on the dashboard already");
    }
  }
  const added = ids.filter((id) => !allowed.has(id));
  const visible = await findVisibleSavedQueries(added, user);
  if (added.some((id) => !visible.has(id))) {
    throw new HttpError(404, "There's no such saved query");
  }
}

function itemRows(dashboardId: string, items: ItemsInput) {
  return items.map((item, position) => ({
    dashboardId,
    savedQueryId: item.savedQueryId ?? null,
    title: item.savedQueryId ? null : (item.title ?? null),
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
  return rows.map((row) => toSummary(row, items.get(row.id) ?? [], user));
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
 * Makes a dashboard for `user`, with the saved queries and titles in `input.items` on it, if any.
 *
 * @throws {HttpError} a 403 when a viewer shares it with everyone, a 404 when a query isn't one
 *   `user` sees, and a 400 when a query is on it twice.
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
      refreshMinutes: input.refreshMinutes,
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
 * Changes a dashboard: its title, description, who sees it, how often it runs its queries again,
 * or its queries and titles, which `items` replaces in the order given.
 *
 * @throws {HttpError} a 404 when `user` doesn't see it or a new query isn't one they see, a 400
 *   when a query is added that's on it already, and a 403 when they can't change it, when
 *   someone other than its owner changes who sees it, and when a viewer shares it with everyone.
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
    await ensureCanAdd(items, user, queryIds(current));
  }

  await db.transaction(async (tx) => {
    // Every field is written, so `updatedAt` moves even when only the queries change.
    await tx.orm.public.Dashboard.where({ id }).update({
      name: changes.name ?? row.name,
      description: changes.description === undefined ? row.description : changes.description,
      scope: changes.scope ?? row.scope,
      refreshMinutes:
        changes.refreshMinutes === undefined ? row.refreshMinutes : changes.refreshMinutes,
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
