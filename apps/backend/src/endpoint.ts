import type { Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";

import { getSessionUser, type SessionUser } from "./auth";

/** One route of the API that anyone can call, signed in or not. */
interface PublicEndpoint {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  access: "public";
  handler: (req: Request, res: Response) => Promise<void> | void;
}

/** One route of the API that needs someone signed in, or, for `admin`, an admin. */
interface SignedInEndpoint {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  access: "user" | "admin";
  handler: (req: Request, res: Response, user: SessionUser) => Promise<void> | void;
}

/**
 * One route of the API: its method, its path, who may call it and what answers it. `access` has
 * no default, so every endpoint says whether it's public.
 */
export type Endpoint = PublicEndpoint | SignedInEndpoint;

/** An error a handler throws to answer with a status and a message, like a 404 or a 409. */
export class HttpError extends Error {
  override name = "HttpError";

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Parses a request's body, or anything else from it, with `schema`.
 *
 * @throws {HttpError} a 400 naming what's wrong when it doesn't match.
 */
export function parseRequest<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new HttpError(400, `${where}${issue?.message ?? "Invalid request"}`);
  }
  return result.data;
}

/**
 * Mounts endpoints on a router, checking the caller's session for those that aren't public
 * (401 when nobody is signed in, 403 when an admin endpoint isn't called by an admin), and
 * passing errors a handler throws or rejects with to Express's error handler.
 */
export function registerEndpoints(router: Router, endpoints: readonly Endpoint[]): void {
  for (const endpoint of endpoints) {
    const handler: RequestHandler = async (req, res, next) => {
      try {
        if (endpoint.access === "public") {
          await endpoint.handler(req, res);
          return;
        }
        const user = await getSessionUser(req.headers);
        if (!user) throw new HttpError(401, "Sign in first");
        if (endpoint.access === "admin" && user.role !== "admin") {
          throw new HttpError(403, "Only admins can do that");
        }
        await endpoint.handler(req, res, user);
      } catch (error) {
        next(error);
      }
    };
    router[endpoint.method](endpoint.path, handler);
  }
}
