import { runQueryRequest } from "@pg_select1/shared";
import { z } from "zod";

import { type Endpoint, parseRequest } from "../../endpoint";
import { listExplorableConnections } from "../connection/service";
import { catalogOf, listTables } from "./catalog";
import { cancelQuery, defineFunction, describeTable, readTable, runQuery } from "./service";

const connectionParams = z.object({ id: z.uuid({ message: "There's no such connection" }) });

const runParams = z.object({ runId: z.uuid({ message: "There's no such query running" }) });

const tableQuery = z.object({
  schema: z.string({ message: "Name a schema" }).min(1, "Name a schema"),
  table: z.string({ message: "Name a table" }).min(1, "Name a table"),
});

// A function's arguments can be none, so only their being there is checked.
const functionQuery = z.object({
  schema: z.string({ message: "Name a schema" }).min(1, "Name a schema"),
  name: z.string({ message: "Name a function" }).min(1, "Name a function"),
  arguments: z.string({ message: "Give the function's arguments" }),
});

/**
 * Exploring connections, for anyone signed in: the connections they can explore (every one for
 * an admin, the visible ones for anyone else), a connection's tables and functions, the same
 * with every table's columns, from memory, for the SQL editor to complete, a table's
 * rows and how it's made (its columns, constraints, indexes and triggers), a function's
 * definition, and running a query of their own on one, and cancelling it. It all runs directly
 * on the connection's database, read-only.
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
      res.json(await listTables(id, user));
    },
  },
  {
    method: "get",
    path: "/api/explore/connections/:id/catalog",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(connectionParams, req.params);
      res.json(await catalogOf(id, user));
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
    method: "get",
    path: "/api/explore/connections/:id/structure",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(connectionParams, req.params);
      const { schema, table } = parseRequest(tableQuery, req.query);
      res.json(await describeTable(id, schema, table, user));
    },
  },
  {
    method: "get",
    path: "/api/explore/connections/:id/function",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(connectionParams, req.params);
      const { schema, name, arguments: args } = parseRequest(functionQuery, req.query);
      res.json(await defineFunction(id, schema, name, args, user));
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
