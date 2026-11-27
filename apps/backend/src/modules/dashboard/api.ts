import { createDashboardRequest, updateDashboardRequest } from "@pg_select1/shared";
import { z } from "zod";

import { type Endpoint, parseRequest } from "../../endpoint";
import {
  createDashboard,
  deleteDashboard,
  getDashboard,
  listDashboards,
  updateDashboard,
} from "./service";

const dashboardParams = z.object({ id: z.uuid({ message: "There's no such dashboard" }) });

/**
 * Dashboards, for anyone signed in: listing the ones they see (every global one and their own
 * personal ones), making one, changing it, its queries included, and deleting it. Who may share
 * and change them goes as for saved queries.
 */
export const endpoints: Endpoint[] = [
  {
    method: "get",
    path: "/api/dashboards",
    access: "user",
    handler: async (_req, res, user) => {
      res.json({ dashboards: await listDashboards(user) });
    },
  },
  {
    method: "post",
    path: "/api/dashboards",
    access: "user",
    handler: async (req, res, user) => {
      const input = parseRequest(createDashboardRequest, req.body);
      res.status(201).json(await createDashboard(input, user));
    },
  },
  {
    method: "get",
    path: "/api/dashboards/:id",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(dashboardParams, req.params);
      res.json(await getDashboard(id, user));
    },
  },
  {
    method: "patch",
    path: "/api/dashboards/:id",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(dashboardParams, req.params);
      const changes = parseRequest(updateDashboardRequest, req.body);
      res.json(await updateDashboard(id, changes, user));
    },
  },
  {
    method: "delete",
    path: "/api/dashboards/:id",
    access: "user",
    handler: async (req, res, user) => {
      const { id } = parseRequest(dashboardParams, req.params);
      await deleteDashboard(id, user);
      res.status(204).end();
    },
  },
];
