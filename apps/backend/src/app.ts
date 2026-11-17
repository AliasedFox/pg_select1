import express, { type ErrorRequestHandler, type RequestHandler } from "express";

import { registerEndpoints } from "./endpoint";
import { endpoints } from "./modules";

/**
 * Builds the Express app with every module's endpoints and, when given, the web app after them.
 * It doesn't listen: `api.ts` does that, and tests drive the app over HTTP on a port of their own.
 */
export function createApp(options: { web?: RequestHandler } = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  const router = express.Router();
  registerEndpoints(router, endpoints);
  app.use(router);

  if (options.web) app.use(options.web);

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);

  return app;
}
