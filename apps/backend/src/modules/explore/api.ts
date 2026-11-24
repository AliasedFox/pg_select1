import { z } from "zod";

import { type Endpoint, parseRequest } from "../../endpoint";
import { listExplorableConnections } from "../connection/service";
import { listTables, readTable } from "./service";

const connectionParams = z.object({ id: z.uuid({ message: "There's no such connection" }) });

const tableQuery = z.object({
  schema: z.string({ message: "Name a schema" }).min(1, "Name a schema"),
  table: z.string({ message: "Name a table" }).min(1, "Name a table"),
});

/**
 * Exploring connections, for anyone signed in: the connections they can explore (every one for
 * an admin, the visible ones for anyone else), a connection's tables, and a table's rows. It all
 * runs directly on the connection's database, read-only.
 */
export const endpoints: Endpoint[] = [
  {
    method: "get",
    path: "/api/explore/connections",
    access: "user",
    handler: async (_req, res, user) => {
      res.json({ connections: await listExplorableConnections(user) });
    },
  },
  {
    method: "get",
    path: "/api/explore/connections/:id/tables",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(connectionParams, req.params);
      res.json({ tables: await listTables(id, user) });
    },
  },
  {
    method: "get",
    path: "/api/explore/connections/:id/rows",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(connectionParams, req.params);
      const { schema, table } = parseRequest(tableQuery, req.query);
      res.json(await readTable(id, schema, table, user));
    },
  },
];
