import { createSavedQueryRequest, updateSavedQueryRequest } from "@pg_select1/shared";
import { z } from "zod";

import { type Endpoint, parseRequest } from "../../endpoint";
import {
  createSavedQuery,
  deleteSavedQuery,
  getSavedQuery,
  listSavedQueries,
  updateSavedQuery,
} from "./service";

const savedQueryParams = z.object({ id: z.uuid({ message: "There's no such saved query" }) });

/**
 * Saved queries, for anyone signed in: listing the ones they see (every global one and their
 * own personal ones), saving one, changing it and deleting it. Viewers save personal queries
 * only; editors and admins can also share them with everyone and change any global one.
 */
export const endpoints: Endpoint[] = [
  {
    method: "get",
    path: "/api/saved-queries",
    access: "user",
    handler: async (_req, res, user) => {
      res.json({ savedQueries: await listSavedQueries(user) });
    },
  },
  {
    method: "post",
    path: "/api/saved-queries",
    access: "user",
    handler: async (req, res, user) => {
      const input = parseRequest(createSavedQueryRequest, req.body);
      res.status(201).json(await createSavedQuery(input, user));
    },
  },
  {
    method: "get",
    path: "/api/saved-queries/:id",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(savedQueryParams, req.params);
      res.json(await getSavedQuery(id, user));
    },
  },
  {
    method: "patch",
    path: "/api/saved-queries/:id",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(savedQueryParams, req.params);
      const changes = parseRequest(updateSavedQueryRequest, req.body);
      res.json(await updateSavedQuery(id, changes, user));
    },
  },
  {
    method: "delete",
    path: "/api/saved-queries/:id",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(savedQueryParams, req.params);
      await deleteSavedQuery(id, user);
      res.status(204).end();
    },
  },
];
