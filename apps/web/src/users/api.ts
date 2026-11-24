import {
  type InviteUserRequest,
  type InviteUserResponse,
  inviteUserResponse,
  type SetPasswordLink,
  setPasswordLink,
  type UpdateUserRequest,
  type User,
  user,
  userList,
} from "@pg_select1/shared";

import { callApi, sendApi } from "@/lib/api";

/** Asks the API for every user, oldest first. Admins only. */
export async function fetchUsers(): Promise<User[]> {
  const { users } = await callApi("GET", "/api/users", userList);
  return users;
}

/** Invites someone, answering them and the link they set their password with. */
export function inviteUser(invite: InviteUserRequest): Promise<InviteUserResponse> {
  return callApi("POST", "/api/users", inviteUserResponse, invite);
}

/** Changes a user's name or role. */
export function updateUser(id: string, changes: UpdateUserRequest): Promise<User> {
  return callApi("PATCH", `/api/users/${id}`, user, changes);
}

/** Deletes a user, signing them out everywhere. */
export async function deleteUser(id: string): Promise<void> {
  await sendApi("DELETE", `/api/users/${id}`);
}

/** Makes a new set-password link for a user, and makes their earlier one stop working. */
export function createSetPasswordLink(id: string): Promise<SetPasswordLink> {
  return callApi("POST", `/api/users/${id}/set-password-link`, setPasswordLink);
}
