import type { Request, RequestHandler, Response, Router } from "express";

/** One route of the API: its method, its path and what answers it. */
export interface Endpoint {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  handler: (req: Request, res: Response) => Promise<void> | void;
}

/**
 * Mounts endpoints on a router, passing errors a handler throws or rejects with to Express's
 * error handler.
 */
export function registerEndpoints(router: Router, endpoints: readonly Endpoint[]): void {
  for (const endpoint of endpoints) {
    const handler: RequestHandler = async (req, res, next) => {
      try {
        await endpoint.handler(req, res);
      } catch (error) {
        next(error);
      }
    };
    router[endpoint.method](endpoint.path, handler);
  }
}
