import {
  createConnectionRequest,
  testConnectionRequest,
  updateConnectionRequest,
} from "@pg_select1/shared";
import { z } from "zod";

import { type Endpoint, parseRequest } from "../../endpoint";
import {
  createConnection,
  deleteConnection,
  listConnections,
  testConnection,
  testSettings,
  updateConnection,
} from "./service";

const connectionParams = z.object({ id: z.uuid({ message: "There's no such connection" }) });

/**
 * Managing connections, for admins only: listing, adding, changing, deleting and testing them,
 * saved or not. No answer ever holds a password.
 */
export const endpoints: Endpoint[] = [
  {
    method: "get",
    path: "/api/connections",
    access: "admin",
    handler: async (_req, res) => {
      res.json({ connections: await listConnections() });
    },
  },
  {
    method: "post",
    path: "/api/connections",
    access: "admin",
    handler: async (req, res) => {
      const input = parseRequest(createConnectionRequest, req.body);
      res.status(201).json(await createConnection(input));
    },
  },
  {
    method: "post",
    path: "/api/connections/test",
    access: "admin",
    handler: async (req, res) => {
      const input = parseRequest(testConnectionRequest, req.body);
      res.json(await testSettings(input));
    },
  },
  {
    method: "patch",
    path: "/api/connections/:id",
    access: "admin",
    handler: async (req, res) => {
      const { id } = parseRequest(connectionParams, req.params);
      const changes = parseRequest(updateConnectionRequest, req.body);
      res.json(await updateConnection(id, changes));
    },
  },
  {
    method: "delete",
    path: "/api/connections/:id",
    access: "admin",
    handler: async (req, res) => {
      const { id } = parseRequest(connectionParams, req.params);
      await deleteConnection(id);
      res.status(204).end();
    },
  },
  {
    method: "post",
    path: "/api/connections/:id/test",
    access: "admin",
    handler: async (req, res) => {
      const { id } = parseRequest(connectionParams, req.params);
      res.json(await testConnection(id));
    },
  },
];
