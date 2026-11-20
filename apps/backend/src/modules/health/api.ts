import type { Endpoint } from "../../endpoint";
import { checkHealth } from "./service";

/** The health check: `GET /health`, 200 when pg_select1 and its database are up, 503 otherwise. */
export const endpoints: Endpoint[] = [
  {
    method: "get",
    path: "/health",
    access: "public",
    handler: async (_req, res) => {
      const health = await checkHealth();
      res.status(health.status === "ok" ? 200 : 503).json(health);
    },
  },
];
