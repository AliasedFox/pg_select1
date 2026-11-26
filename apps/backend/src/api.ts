import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createApp } from "./app";
import { readEnv } from "./env";
import { startJobs, stopJobs } from "./jobs";
import { jobs } from "./modules";
import { listWebDir, serveWeb, type WebFiles } from "./web";

/**
 * Starts pg_select1: its background jobs, then the API, and the web app's build when there is
 * one, on one port. On SIGTERM or SIGINT, as from `docker stop`, it stops taking requests and lets
 * the jobs that are running finish before it exits.
 *
 * @param webFiles the web app's files, when they're embedded in a compiled executable; otherwise
 *   they're read from `PG_SELECT1_WEB_DIR`, or the web app's `dist/` next to this source. Without
 *   either, as in development where Vite serves it, only the API runs.
 */
export async function start(webFiles?: WebFiles): Promise<void> {
  const env = readEnv();
  const webDir = env.PG_SELECT1_WEB_DIR ?? resolve(import.meta.dir, "../../web/dist");
  const files = webFiles ?? (existsSync(webDir) ? await listWebDir(webDir) : undefined);

  await startJobs(jobs);
  const app = createApp({ web: files ? await serveWeb(files) : undefined });
  const server = app.listen(env.PORT, () => {
    console.log(`pg_select1 listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await stopJobs();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

if (import.meta.main) await start();
