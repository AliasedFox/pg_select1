import { z } from "zod";

/** What `GET /health` answers: whether pg_select1 is up and can reach its own database. */
export const healthResponse = z.object({
  status: z.enum(["ok", "error"]),
  version: z.string(),
  database: z.object({
    ok: z.boolean(),
    latencyMs: z.number().nullable(),
  }),
  time: z.iso.datetime(),
});

/** The body of a `GET /health` response, as {@link healthResponse} parses it. */
export type HealthResponse = z.infer<typeof healthResponse>;
