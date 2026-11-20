import { randomBytes } from "node:crypto";

import type {
  InviteUserRequest,
  Role,
  SetPasswordLink,
  UpdateUserRequest,
  User,
} from "@pg_select1/shared";

import { auth, SET_PASSWORD_LINK_DAYS } from "../../auth";
import { db } from "../../db";
import { HttpError } from "../../endpoint";
import { readEnv } from "../../env";

const { PG_SELECT1_URL } = readEnv();

const userFields = ["id", "email", "name", "role", "createdAt"] as const;

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

// Someone is active once they have a password, which Better Auth keeps in a `credential` account.
async function usersWithPasswords(): Promise<Set<string>> {
  const accounts = await db.orm.public.Account.where({ providerId: "credential" })
    .select("userId")
    .all();
  return new Set(accounts.map((account) => account.userId));
}

function toUser(row: UserRow, hasPassword: boolean): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: hasPassword ? "active" : "invited",
    createdAt: row.createdAt.toISOString(),
  };
}

async function findUser(id: string): Promise<UserRow> {
  const row = await db.orm.public.User.select(...userFields).first({ id });
  if (!row) throw new HttpError(404, "There's no such user");
  return row;
}

async function countAdmins(): Promise<number> {
  const { admins } = await db.orm.public.User.where({ role: "admin" }).aggregate((aggregate) => ({
    admins: aggregate.count(),
  }));
  return admins;
}

/** Answers every user, oldest first, with whether they've set a password yet. */
export async function listUsers(): Promise<User[]> {
  const [rows, withPasswords] = await Promise.all([
    db.orm.public.User.select(...userFields)
      .orderBy((u) => u.createdAt.asc())
      .all(),
    usersWithPasswords(),
  ]);
  return rows.map((row) => toUser(row, withPasswords.has(row.id)));
}

/**
 * Makes a new link for a user to set their password with, and makes any earlier one stop
 * working. For someone invited it's their invite; for someone active, a password reset.
 *
 * The token is one Better Auth's reset-password endpoint accepts, so the web app's set-password
 * page posts it there, and Better Auth creates the user's password on first use.
 *
 * @throws {HttpError} a 404 when there's no such user.
 */
export async function createSetPasswordLink(userId: string): Promise<SetPasswordLink> {
  await findUser(userId);
  // Reset tokens are the only verifications pg_select1 makes, each holding its user's id.
  await db.orm.public.Verification.where({ value: userId }).deleteAll();

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SET_PASSWORD_LINK_DAYS * 24 * 60 * 60 * 1000);
  const context = await auth.$context;
  await context.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt,
  });

  const url = new URL("/set-password", PG_SELECT1_URL);
  url.searchParams.set("token", token);
  return { url: url.toString(), expiresAt: expiresAt.toISOString() };
}

/**
 * Adds a user without a password, and answers the link they set one with.
 *
 * @throws {HttpError} a 409 when someone already has that email.
 */
export async function inviteUser(
  invite: InviteUserRequest,
): Promise<{ user: User; link: SetPasswordLink }> {
  const existing = await db.orm.public.User.select("id").first({ email: invite.email });
  if (existing) throw new HttpError(409, `${invite.email} already has an account`);

  const row = await db.orm.public.User.select(...userFields).create({
    email: invite.email,
    name: invite.name,
    role: invite.role,
    emailVerified: false,
  });
  const link = await createSetPasswordLink(row.id);
  return { user: toUser(row, false), link };
}

/**
 * Changes a user's name or role.
 *
 * @throws {HttpError} a 404 when there's no such user, and a 409 when it would leave nobody an
 *   admin.
 */
export async function updateUser(id: string, changes: UpdateUserRequest): Promise<User> {
  const row = await findUser(id);
  if (
    row.role === "admin" &&
    changes.role &&
    changes.role !== "admin" &&
    (await countAdmins()) <= 1
  ) {
    throw new HttpError(409, "pg_select1 needs at least one admin");
  }

  const updated = await db.orm.public.User.where({ id })
    .select(...userFields)
    .update({
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.role === undefined ? {} : { role: changes.role }),
    });
  if (!updated) throw new HttpError(404, "There's no such user");
  return toUser(updated, (await usersWithPasswords()).has(id));
}

/**
 * Deletes a user, their sessions and their password, signing them out everywhere.
 *
 * @param actingUserId the admin doing it, who can't delete themselves.
 * @throws {HttpError} a 404 when there's no such user, a 400 for the admin themselves, and a 409
 *   for the last admin.
 */
export async function deleteUser(id: string, actingUserId: string): Promise<void> {
  if (id === actingUserId) throw new HttpError(400, "You can't delete yourself");
  const row = await findUser(id);
  if (row.role === "admin" && (await countAdmins()) <= 1) {
    throw new HttpError(409, "pg_select1 needs at least one admin");
  }

  await db.transaction(async (tx) => {
    await tx.orm.public.Verification.where({ value: id }).deleteAll();
    // Sessions and accounts go with it, by their foreign keys' `ON DELETE CASCADE`.
    await tx.orm.public.User.where({ id }).delete();
  });
}
