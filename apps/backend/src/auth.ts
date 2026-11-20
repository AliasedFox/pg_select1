import type { IncomingHttpHeaders } from "node:http";

import { type Role, role } from "@pg_select1/shared";
import { betterAuth } from "better-auth";
import { fromNodeHeaders } from "better-auth/node";
import { Pool } from "pg";

import { readEnv } from "./env";

const env = readEnv();

// Better Auth reads and writes its tables through its own `pg` pool; Prisma only owns their DDL
// (see `prisma/contract.ts`). These map its field names to the contract's snake_case columns.
const timestamps = { createdAt: "created_at", updatedAt: "updated_at" };

/** How long an invite or set-password link works for. */
export const SET_PASSWORD_LINK_DAYS = 7;

/**
 * Better Auth, for signing in with an email and password and for sessions in pg_select1's own
 * database, mounted at `/api/auth`.
 *
 * Nobody can sign up: an admin invites people (`user` module) or adds them from the shell
 * (`pg_select1 user add`), and they set their password from the link they're given, through
 * Better Auth's reset-password endpoint. There's no email, so asking for a reset link is off.
 */
export const auth = betterAuth({
  appName: "pg_select1",
  baseURL: env.PG_SELECT1_URL,
  basePath: "/api/auth",
  trustedOrigins: env.trustedOrigins,
  secret: env.PG_SELECT1_SECRET_KEY,
  database: new Pool({ connectionString: env.DATABASE_URL, max: 5 }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    resetPasswordTokenExpiresIn: SET_PASSWORD_LINK_DAYS * 24 * 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    modelName: "users",
    fields: { emailVerified: "email_verified", ...timestamps },
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "viewer", input: false },
    },
  },
  session: {
    modelName: "sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      ...timestamps,
    },
  },
  account: {
    modelName: "accounts",
    fields: {
      userId: "user_id",
      providerId: "provider_id",
      accountId: "account_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      ...timestamps,
    },
  },
  verification: {
    modelName: "verifications",
    fields: { expiresAt: "expires_at", ...timestamps },
    // A leaked copy of the table doesn't give away working links.
    storeIdentifier: "hashed",
  },
  advanced: {
    database: { generateId: () => Bun.randomUUIDv7() },
  },
  telemetry: { enabled: false },
  // Tests try what's refused on purpose; its warnings would bury their output.
  logger: { disabled: env.NODE_ENV === "test" },
});

/** The signed-in user a request is made by. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Answers who sent a request, from its session cookie, or `null` when nobody is signed in. */
export async function getSessionUser(headers: IncomingHttpHeaders): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name, role: role.parse(session.user.role) };
}
