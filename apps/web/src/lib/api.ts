import type { z } from "zod";

/** A response from select1's API with a body that isn't what its schema says. */
export class ApiError extends Error {
  override name = "ApiError";
}

/**
 * Fetches a path on select1's API and parses the JSON body with `schema`, whatever the status,
 * since some endpoints (like `/health`) answer with a body on errors too.
 *
 * @throws {ApiError} when the body isn't JSON or doesn't match `schema`.
 */
export async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T>> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`${path} answered ${res.status} without JSON`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(`${path} answered ${res.status} with an unexpected body`);
  }
  return parsed.data;
}
