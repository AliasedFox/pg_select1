import { toNodeHandler } from "better-auth/node";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";

import { auth } from "./auth";
import { HttpError, registerEndpoints } from "./endpoint";
import { endpoints } from "./modules";

/**
 * Builds the Express app with Better Auth, every module's endpoints and, when given, the web app
 * after them. It doesn't listen: `api.ts` does that, and tests drive the app over HTTP on a port
 * of their own.
 */
export function createApp(options: { web?: RequestHandler } = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // Before `express.json()`: Better Auth reads the raw body itself.
  app.all("/api/auth/{*path}", toNodeHandler(auth));
  app.use(express.json());

  const router = express.Router();
  registerEndpoints(router, endpoints);
  app.use(router);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  if (options.web) app.use(options.web);

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);

  return app;
}
