import type { z } from "zod";

/**
 * A response from pg_select1's API that isn't what was asked for: an error status, or a body
 * that isn't what its schema says. `message` is the API's own when it gave one.
 */
export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Fetches a path on pg_select1's API and parses the JSON body with `schema`, whatever the status,
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
    throw new ApiError(`${path} answered ${res.status} without JSON`, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(`${path} answered ${res.status} with an unexpected body`, res.status);
  }
  return parsed.data;
}

// pg_select1's endpoints answer `{ error }`, Better Auth's `{ message }`.
function errorMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error === "string") return error;
  if (typeof message === "string") return message;
  return undefined;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Calls an endpoint of pg_select1's API, sending `body` as JSON, and answers its body as JSON,
 * or `undefined` when there's none.
 *
 * @throws {ApiError} with the API's message and the status when it doesn't answer 2xx.
 */
export async function sendApi(method: Method, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let answer: unknown;
  try {
    answer = text ? JSON.parse(text) : undefined;
  } catch {
    answer = undefined;
  }
  if (!res.ok) {
    throw new ApiError(errorMessage(answer) ?? `${path} answered ${res.status}`, res.status);
  }
  return answer;
}

/**
 * Calls an endpoint of pg_select1's API like {@link sendApi}, and parses its answer with
 * `schema`.
 *
 * @throws {ApiError} with the API's message and the status when it doesn't answer 2xx, and when
 *   the body doesn't match `schema`.
 */
export async function callApi<T extends z.ZodType>(
  method: Method,
  path: string,
  schema: T,
  body?: unknown,
): Promise<z.output<T>> {
  const parsed = schema.safeParse(await sendApi(method, path, body));
  if (!parsed.success) throw new ApiError(`${path} answered with an unexpected body`);
  return parsed.data;
}

/** A message to show for an error from {@link sendApi} or anything else that failed. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
