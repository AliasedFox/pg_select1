import { inviteUserRequest, updateMeRequest, updateUserRequest } from "@pg_select1/shared";
import { z } from "zod";

import { type Endpoint, parseRequest } from "../../endpoint";
import { createSetPasswordLink, deleteUser, inviteUser, listUsers, updateUser } from "./service";

const userParams = z.object({ id: z.uuid({ message: "There's no such user" }) });

/**
 * Who's signed in (`GET /api/me`) and changing their own name (`PATCH /api/me`), and managing
 * users, for admins only: listing, inviting, changing, deleting, and making a new set-password
 * link. Changing one's own password is Better Auth's (`POST /api/auth/change-password`).
 */
export const endpoints: Endpoint[] = [
  {
    method: "get",
    path: "/api/me",
    access: "user",
    handler: (_req, res, user) => {
      res.json(user);
    },
  },
  {
    method: "patch",
    path: "/api/me",
    access: "user",
    handler: async (req, res, user) => {
      const { name } = parseRequest(updateMeRequest, req.body);
      const updated = await updateUser(user.id, { name });
      res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role });
    },
  },
  {
    method: "get",
    path: "/api/users",
    access: "admin",
    handler: async (_req, res) => {
      res.json({ users: await listUsers() });
    },
  },
  {
    method: "post",
    path: "/api/users",
    access: "admin",
    handler: async (req, res) => {
      const invite = parseRequest(inviteUserRequest, req.body);
      res.status(201).json(await inviteUser(invite));
    },
  },
  {
    method: "patch",
    path: "/api/users/:id",
    access: "admin",
    handler: async (req, res) => {
      const { id } = parseRequest(userParams, req.params);
      const changes = parseRequest(updateUserRequest, req.body);
      res.json(await updateUser(id, changes));
    },
  },
  {
    method: "delete",
    path: "/api/users/:id",
    access: "admin",
    handler: async (req, res, user) => {
      const { id } = parseRequest(userParams, req.params);
      await deleteUser(id, user.id);
      res.status(204).end();
    },
  },
  {
    method: "post",
    path: "/api/users/:id/set-password-link",
    access: "admin",
    handler: async (req, res) => {
      const { id } = parseRequest(userParams, req.params);
      res.json(await createSetPasswordLink(id));
    },
  },
];
