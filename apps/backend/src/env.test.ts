import { describe, expect, test } from "bun:test";

import { readEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://select1:select1@localhost:5440/pg_select1",
  PG_SELECT1_SECRET_KEY: "a-secret-key-of-at-least-32-characters",
};

describe("PG_SELECT1_URL", () => {
  test("is required in production", () => {
    expect(() => readEnv({ ...base, NODE_ENV: "production" })).toThrow(
      /required in production[\s\S]*at PG_SELECT1_URL/,
    );
  });

  test("is used as given in production, without a trailing slash", () => {
    const env = readEnv({
      ...base,
      NODE_ENV: "production",
      PG_SELECT1_URL: "https://pg_select1.example.com/",
    });
    expect(env.PG_SELECT1_URL).toBe("https://pg_select1.example.com");
    expect(env.trustedOrigins).toEqual([]);
  });

  test("defaults to localhost elsewhere, trusting 127.0.0.1 too", () => {
    const env = readEnv({ ...base, NODE_ENV: "development", PORT: "4000" });
    expect(env.PG_SELECT1_URL).toBe("http://localhost:4000");
    expect(env.trustedOrigins).toEqual(["http://127.0.0.1:4000"]);
  });
});
