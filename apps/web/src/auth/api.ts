import { type Me, me, type UpdateMeRequest } from "@pg_select1/shared";

import { ApiError, callApi, sendApi } from "@/lib/api";

/** Asks the API who's signed in, answering `null` when nobody is. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await callApi("GET", "/api/me", me);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/**
 * Signs in with an email and password, through Better Auth, which sets the session cookie.
 *
 * @throws {ApiError} when they're wrong.
 */
export async function signIn(email: string, password: string): Promise<void> {
  await sendApi("POST", "/api/auth/sign-in/email", { email, password });
}

/** Signs out, clearing the session cookie. */
export async function signOut(): Promise<void> {
  await sendApi("POST", "/api/auth/sign-out", {});
}

/**
 * Sets a password with the token from an invite or set-password link.
 *
 * @throws {ApiError} when the link has expired, been used or been replaced by a newer one.
 */
export async function setPassword(token: string, newPassword: string): Promise<void> {
  await sendApi("POST", "/api/auth/reset-password", { token, newPassword });
}

/** Changes the signed-in user's name or theme, answering them as they are now. */
export function updateMe(changes: UpdateMeRequest): Promise<Me> {
  return callApi("PATCH", "/api/me", me, changes);
}

/**
 * Changes the signed-in user's password, through Better Auth, and signs them out everywhere
 * else. This browser stays signed in, on a new session cookie.
 *
 * @throws {ApiError} when the current password is wrong or the new one too short.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await sendApi("POST", "/api/auth/change-password", {
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  });
}
