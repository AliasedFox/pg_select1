import type { Role } from "@pg_select1/shared";

import { createApp } from "../src/app";
import { createSetPasswordLink, inviteUser } from "../src/modules/user/service";

const server = createApp().listen(0);
const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("The test API isn't listening on a TCP port");
}
const { port } = address;

/**
 * Sends a request to the API under test, the whole app as it runs in production, over HTTP.
 * It comes from the web app's origin, as a browser's would, since Better Auth checks it.
 */
export function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", process.env.PG_SELECT1_URL ?? "");
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`http://localhost:${port}${path}`, { ...init, headers });
}

/** The token in a set-password link. */
export function tokenOf(url: string): string {
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error(`${url} has no token`);
  return token;
}

/** Signs in with an email and password, answering the session cookie, or `null` if refused. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const res = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const cookie = res.headers.getSetCookie().find((c) => c.includes("session_token"));
  return cookie ? cookie.split(";")[0]! : null;
}

let users = 0;

/**
 * Adds a user with a role who has set their password, and signs them in, answering who they
 * are and the `cookie` header their requests send.
 */
export async function signedInAs(
  role: Role,
): Promise<{ id: string; email: string; password: string; cookie: string }> {
  users += 1;
  const email = `${role}${users}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = "correct horse battery staple";
  const { user } = await inviteUser({ email, name: `${role} ${users}`, role });
  const link = await createSetPasswordLink(user.id);
  const res = await request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: tokenOf(link.url), newPassword: password }),
  });
  if (!res.ok) throw new Error(`Setting ${email}'s password failed: ${await res.text()}`);
  const cookie = await signIn(email, password);
  if (!cookie) throw new Error(`Signing in as ${email} failed`);
  return { id: user.id, email, password, cookie };
}
