import { runQueryRequest } from "@pg_select1/shared";
import { z } from "zod";

import { type Endpoint, parseRequest } from "../../endpoint";
import { listExplorableConnections } from "../connection/service";
import { cancelQuery, listTables, readTable, runQuery } from "./service";

const connectionParams = z.object({ id: z.uuid({ message: "There's no such connection" }) });

const runParams = z.object({ runId: z.uuid({ message: "There's no such query running" }) });

const tableQuery = z.object({
  schema: z.string({ message: "Name a schema" }).min(1, "Name a schema"),
  table: z.string({ message: "Name a table" }).min(1, "Name a table"),
});

/**
 * Exploring connections, for anyone signed in: the connections they can explore (every one for
 * an admin, the visible ones for anyone else), a connection's tables, a table's rows, and running
 * a query of their own on one, and cancelling it. It all runs directly on the connection's
 * database, read-only.
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
  {
    method: "post",
    path: "/api/explore/connections/:id/query",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(connectionParams, req.params);
      const { sql, runId, offset } = parseRequest(runQueryRequest, req.body);
      res.json(await runQuery(id, sql, user, runId, offset));
    },
  },
  {
    method: "post",
    path: "/api/explore/queries/:runId/cancel",
    access: "user",
    handler: (req, res, user) => {
      const { runId } = parseRequest(runParams, req.params);
      cancelQuery(runId, user);
      res.status(204).end();
    },
  },
];
