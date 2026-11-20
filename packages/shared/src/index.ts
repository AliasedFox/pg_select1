import { z } from "zod";

/** What `GET /health` answers: whether pg_select1 is up and can reach its own database. */
export const healthResponse = z.object({
  status: z.enum(["ok", "error"]),
  version: z.string(),
  database: z.object({
    ok: z.boolean(),
    latencyMs: z.number().nullable(),
  }),
  time: z.iso.datetime(),
});

/** The body of a `GET /health` response, as {@link healthResponse} parses it. */
export type HealthResponse = z.infer<typeof healthResponse>;

/** What an API error answers: a message to show. */
export const errorResponse = z.object({ error: z.string() });

/** The body of an API error, as {@link errorResponse} parses it. */
export type ErrorResponse = z.infer<typeof errorResponse>;

/**
 * What a user may do in pg_select1: an admin manages users and, later, connections. Editors and
 * viewers can do the same things until there are saved queries and alerts to edit.
 */
export const role = z.enum(["admin", "editor", "viewer"]);

/** One of the {@link role}s. */
export type Role = z.infer<typeof role>;

/** Every role, most powerful first, for pickers and labels. */
export const roles: readonly Role[] = role.options;

/** Who's signed in, as `GET /api/me` answers. */
export const me = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role,
});

/** The signed-in user, as {@link me} parses it. */
export type Me = z.infer<typeof me>;

/**
 * A user as an admin sees them in `GET /api/users`. `invited` means they haven't set a password
 * from their invite link yet.
 */
export const user = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role,
  status: z.enum(["invited", "active"]),
  createdAt: z.iso.datetime(),
});

/** A user, as {@link user} parses it. */
export type User = z.infer<typeof user>;

/** What `GET /api/users` answers: every user, oldest first. */
export const userList = z.object({ users: z.array(user) });

/** The body of `POST /api/users`: who to invite and with what role. */
export const inviteUserRequest = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().min(1).max(200),
  role,
});

/** An invite, as {@link inviteUserRequest} parses it. */
export type InviteUserRequest = z.infer<typeof inviteUserRequest>;

/** The body of `PATCH /api/users/:id`: the fields to change. */
export const updateUserRequest = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  role: role.optional(),
});

/** A change to a user, as {@link updateUserRequest} parses it. */
export type UpdateUserRequest = z.infer<typeof updateUserRequest>;

/**
 * A link that lets a user set their password, valid until `expiresAt`. pg_select1 doesn't send
 * email, so the admin passes it on.
 */
export const setPasswordLink = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

/** A set-password link, as {@link setPasswordLink} parses it. */
export type SetPasswordLink = z.infer<typeof setPasswordLink>;

/** What `POST /api/users` answers: the invited user and the link to send them. */
export const inviteUserResponse = z.object({ user, link: setPasswordLink });

/** The body of a `POST /api/users` response, as {@link inviteUserResponse} parses it. */
export type InviteUserResponse = z.infer<typeof inviteUserResponse>;
