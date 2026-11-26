import type {
  createSavedQueryRequest,
  ExplorableConnection,
  QueryScope,
  SavedQuery,
  updateSavedQueryRequest,
} from "@pg_select1/shared";
import { or } from "@prisma/orm-postgres/orm-client";
import type { z } from "zod";

import type { SessionUser } from "../../auth";
import { db } from "../../db";
import { HttpError } from "../../endpoint";
import { findExplorableConnections } from "../connection/service";

const savedQueryFields = [
  "id",
  "name",
  "description",
  "sql",
  "scope",
  "ownerId",
  "createdAt",
  "updatedAt",
] as const;

interface SavedQueryRow {
  id: string;
  name: string;
  description: string | null;
  sql: string;
  scope: QueryScope;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string } | null;
}

function savedQueries() {
  return db.orm.public.SavedQuery.select(...savedQueryFields).include("owner", (owner) =>
    owner.select("id", "name"),
  );
}

// A personal query is its owner's alone; a global one is everyone's.
function canSee(row: SavedQueryRow, user: SessionUser): boolean {
  return row.scope === "global" || row.ownerId === user.id;
}

// Its owner can change a query; editors and admins can change any global one too.
function canEdit(row: SavedQueryRow, user: SessionUser): boolean {
  return row.ownerId === user.id || (row.scope === "global" && user.role !== "viewer");
}

function ensureCanShare(scope: QueryScope, user: SessionUser): void {
  if (scope === "global" && user.role === "viewer") {
    throw new HttpError(403, "Only editors and admins can share a query with everyone");
  }
}

// The connections of each saved query in `ids`, first one first, without those `user` can't
// explore: hidden ones, for anyone but an admin.
async function connectionsOf(
  ids: readonly string[],
  user: SessionUser,
): Promise<Map<string, ExplorableConnection[]>> {
  const byQuery = new Map<string, ExplorableConnection[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return byQuery;
  const rows = await db.orm.public.SavedQueryConnection.select("savedQueryId", "position")
    .include("connection", (c) => c.select("id", "name", "visible"))
    .where((r) => r.savedQueryId.in([...ids]))
    .orderBy((r) => r.position.asc())
    .all();
  for (const { savedQueryId, connection } of rows) {
    if (!connection || (!connection.visible && user.role !== "admin")) continue;
    byQuery.get(savedQueryId)?.push({ id: connection.id, name: connection.name });
  }
  return byQuery;
}

function toSavedQuery(
  row: SavedQueryRow,
  connections: ExplorableConnection[],
  user: SessionUser,
): SavedQuery {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sql: row.sql,
    scope: row.scope,
    connections,
    owner: row.owner,
    canEdit: canEdit(row, user),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findVisible(id: string, user: SessionUser): Promise<SavedQueryRow> {
  const row = await savedQueries().first({ id });
  // Someone else's personal query is as good as missing.
  if (!row || !canSee(row, user)) throw new HttpError(404, "There's no such saved query");
  return row;
}

async function answer(id: string, user: SessionUser): Promise<SavedQuery> {
  const row = await findVisible(id, user);
  const connections = await connectionsOf([id], user);
  return toSavedQuery(row, connections.get(id) ?? [], user);
}

/** Answers the saved queries `user` sees, by name: every global one, and their personal ones. */
export async function listSavedQueries(user: SessionUser): Promise<SavedQuery[]> {
  const rows = await savedQueries()
    .where((q) => or(q.scope.eq("global"), q.ownerId.eq(user.id)))
    .orderBy((q) => q.name.asc())
    .all();
  const connections = await connectionsOf(
    rows.map((r) => r.id),
    user,
  );
  return rows.map((row) => toSavedQuery(row, connections.get(row.id) ?? [], user));
}

/**
 * Answers one saved query `user` sees.
 *
 * @throws {HttpError} a 404 when there's no such query, or it's someone else's personal one.
 */
export async function getSavedQuery(id: string, user: SessionUser): Promise<SavedQuery> {
  return answer(id, user);
}

/**
 * Saves a query for `user`, on connections they can explore. It isn't run: a query that fails
 * can be saved to fix later.
 *
 * @throws {HttpError} a 403 when a viewer shares it with everyone, and a 404 when a connection
 *   isn't one `user` can explore.
 */
export async function createSavedQuery(
  input: z.output<typeof createSavedQueryRequest>,
  user: SessionUser,
): Promise<SavedQuery> {
  ensureCanShare(input.scope, user);
  const connections = await findExplorableConnections(input.connectionIds, user);
  const id = await db.transaction(async (tx) => {
    const created = await tx.orm.public.SavedQuery.select("id").create({
      name: input.name,
      description: input.description ?? null,
      sql: input.sql,
      scope: input.scope,
      ownerId: user.id,
    });
    await tx.orm.public.SavedQueryConnection.createAll(
      connections.map((c, position) => ({
        savedQueryId: created.id,
        connectionId: c.id,
        position,
      })),
    );
    return created.id;
  });
  return answer(id, user);
}

/**
 * Changes a saved query: its name, description, SQL, connections or who sees it.
 *
 * @throws {HttpError} a 404 when `user` doesn't see it or a new connection isn't one they can
 *   explore, and a 403 when they can't change it, when someone other than its owner changes who
 *   sees it, and when a viewer shares it with everyone.
 */
export async function updateSavedQuery(
  id: string,
  changes: z.output<typeof updateSavedQueryRequest>,
  user: SessionUser,
): Promise<SavedQuery> {
  const row = await findVisible(id, user);
  if (!canEdit(row, user)) {
    throw new HttpError(403, "Only its owner, or an editor or admin, can change this query");
  }
  if (changes.scope !== undefined && changes.scope !== row.scope) {
    // Making it personal would hide it in someone else's list, and only they could undo that.
    if (row.ownerId !== user.id) {
      throw new HttpError(403, "Only the user who saved this query can change who sees it");
    }
    ensureCanShare(changes.scope, user);
  }
  const connections =
    changes.connectionIds === undefined
      ? undefined
      : await findExplorableConnections(changes.connectionIds, user);

  await db.transaction(async (tx) => {
    // Every field is written, so `updatedAt` moves even when only the connections change.
    await tx.orm.public.SavedQuery.where({ id }).update({
      name: changes.name ?? row.name,
      description: changes.description === undefined ? row.description : changes.description,
      sql: changes.sql ?? row.sql,
      scope: changes.scope ?? row.scope,
    });
    if (connections) {
      await tx.orm.public.SavedQueryConnection.where({ savedQueryId: id }).deleteAll();
      await tx.orm.public.SavedQueryConnection.createAll(
        connections.map((c, position) => ({ savedQueryId: id, connectionId: c.id, position })),
      );
    }
  });
  return answer(id, user);
}

/**
 * Deletes a saved query.
 *
 * @throws {HttpError} a 404 when `user` doesn't see it, and a 403 when they can't change it.
 */
export async function deleteSavedQuery(id: string, user: SessionUser): Promise<void> {
  const row = await findVisible(id, user);
  if (!canEdit(row, user)) {
    throw new HttpError(403, "Only its owner, or an editor or admin, can delete this query");
  }
  // Its connections go with it, by their foreign key's `ON DELETE CASCADE`.
  await db.orm.public.SavedQuery.where({ id }).delete();
}
