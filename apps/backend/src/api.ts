import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createApp } from "./app";
import { readEnv } from "./env";
import { listWebDir, serveWeb, type WebFiles } from "./web";

/**
 * Starts select1: the API, and the web app's build when there is one, on one port.
 *
 * @param webFiles the web app's files, when they're embedded in a compiled executable; otherwise
 *   they're read from `SELECT1_WEB_DIR`, or the web app's `dist/` next to this source. Without
 *   either, as in development where Vite serves it, only the API runs.
 */
export async function start(webFiles?: WebFiles): Promise<void> {
  const env = readEnv();
  const webDir = env.SELECT1_WEB_DIR ?? resolve(import.meta.dir, "../../web/dist");
  const files = webFiles ?? (existsSync(webDir) ? await listWebDir(webDir) : undefined);

  const app = createApp({ web: files ? await serveWeb(files) : undefined });
  app.listen(env.PORT, () => {
    console.log(`select1 listening on http://localhost:${env.PORT}`);
  });
}

if (import.meta.main) await start();
