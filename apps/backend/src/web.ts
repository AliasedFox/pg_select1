import type { RequestHandler } from "express";

/** The web app's built files, by the URL path each is served at, as paths to read them from. */
export type WebFiles = Record<string, string>;

/** Lists a built web app's files (Vite's `dist/`), by the URL path each is served at. */
export async function listWebDir(dir: string): Promise<WebFiles> {
  const files: WebFiles = {};
  for await (const path of new Bun.Glob("**/*").scan({ cwd: dir })) {
    files[`/${path}`] = `${dir}/${path}`;
  }
  return files;
}

/**
 * Serves the web app: its files as they are, and `index.html` for any other page a browser asks
 * for, since the app routes in the browser. Every file is read into memory once, up front.
 *
 * Mount it after the API's endpoints: it answers every GET that accepts HTML.
 *
 * @throws {Error} when the files have no `/index.html`.
 */
export async function serveWeb(files: WebFiles): Promise<RequestHandler> {
  const loaded = new Map<string, { body: Buffer; type: string }>();
  for (const [urlPath, filePath] of Object.entries(files)) {
    const file = Bun.file(filePath);
    loaded.set(urlPath, { body: Buffer.from(await file.arrayBuffer()), type: file.type });
  }
  const index = loaded.get("/index.html");
  if (!index) throw new Error("The web app's build has no index.html");

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const file = loaded.get(req.path);
    if (file) {
      // Vite puts a hash of their content in the names of what's under /assets/.
      const immutable = req.path.startsWith("/assets/");
      res.set("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
      res.type(file.type).send(file.body);
      return;
    }
    const isPage = !req.path.startsWith("/api/") && !req.path.startsWith("/assets/");
    if (isPage && req.accepts("html")) {
      res.set("cache-control", "no-cache").type(index.type).send(index.body);
      return;
    }
    next();
  };
}
