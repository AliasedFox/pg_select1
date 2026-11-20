// Runs before every backend test file: one throwaway Postgres as pg_select1's database, migrated
// the way production is, for the whole test run.
import { afterAll } from "bun:test";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Wait } from "testcontainers";

// The default wait also checks the port from inside the container with `docker exec`, which
// never returns under Bun; Postgres's own health check (`pg_isready`) is enough.
const container = await new PostgreSqlContainer("postgres:17-alpine")
  .withWaitStrategy(Wait.forHealthCheck())
  .start();
process.env.DATABASE_URL = container.getConnectionUri();
process.env.NODE_ENV = "test";
process.env.PG_SELECT1_SECRET_KEY = "test-secret-key-at-least-32-characters";
process.env.PG_SELECT1_URL = "http://localhost:5190";

const migrate = Bun.spawnSync(["bun", "--bun", "prisma", "db", "migrate"], {
  cwd: `${import.meta.dir}/..`,
  env: { ...process.env, DO_NOT_TRACK: "1" },
});
if (!migrate.success) {
  throw new Error(
    `prisma db migrate failed:\n${migrate.stdout.toString()}${migrate.stderr.toString()}`,
  );
}

afterAll(async () => {
  await container.stop();
});
