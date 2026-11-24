import { z } from "zod";

const schema = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3100),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Where the web app's build is; it's served only when there is one.
    PG_SELECT1_WEB_DIR: z.string().optional(),
    // Signs sessions and tokens. Changing it signs everyone out.
    PG_SELECT1_SECRET_KEY: z.string().min(32, "must be at least 32 characters"),
    // The address people open pg_select1 at. Sign-in only works from it, and invite links point
    // at it. Required in production; elsewhere, http://localhost:<PORT>.
    PG_SELECT1_URL: z.url({ protocol: /^https?$/ }).optional(),
  })
  .superRefine((env, ctx) => {
    // Without it, Better Auth would trust only localhost and refuse every sign-in on a server
    // with "Invalid origin", so fail here instead, saying what to set.
    if (env.NODE_ENV === "production" && env.PG_SELECT1_URL === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["PG_SELECT1_URL"],
        message:
          "required in production: the address people open pg_select1 at, e.g. https://pg_select1.example.com. Sign-in refuses requests from any other address.",
      });
    }
  })
  .transform(({ PG_SELECT1_URL, ...env }) => ({
    ...env,
    PG_SELECT1_URL: (PG_SELECT1_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, ""),
    // Origins Better Auth trusts besides PG_SELECT1_URL's: with the default, 127.0.0.1 too, since
    // the executable on a laptop is opened at either.
    trustedOrigins: PG_SELECT1_URL === undefined ? [`http://127.0.0.1:${env.PORT}`] : [],
  }));

/** pg_select1's settings, read from environment variables and validated once, at start-up. */
export type Env = z.infer<typeof schema>;

/**
 * Reads pg_select1's settings from the environment.
 *
 * @throws {Error} naming every variable that is missing or invalid, so start-up fails early
 *   rather than on the first request that needs it.
 */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
