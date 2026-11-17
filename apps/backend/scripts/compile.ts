// Builds select1 into one executable with the web app embedded: `bun run build:binary [target]`,
// e.g. `bun-darwin-arm64` or `bun-linux-x64` (default: this machine). Writes `dist/select1`.
//
// The web app must be built first (`bun run build` at the root). Each of its files is embedded
// with an import `with { type: "file" }`, in an entry point generated for the build.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { listWebDir } from "../src/web";

const root = resolve(import.meta.dir, "..");
const webDir = resolve(root, "../web/dist");
const genDir = resolve(root, ".compile");
const target = process.argv[2];

function isCompileTarget(value: string): value is Bun.Build.CompileTarget {
  return /^bun-(darwin|linux|windows)-/.test(value);
}
if (target !== undefined && !isCompileTarget(target)) {
  throw new Error(`Unknown target ${target}: use one like bun-darwin-arm64 or bun-linux-x64.`);
}

const files = await listWebDir(webDir);
if (!files["/index.html"]) {
  throw new Error(`No web app build in ${webDir}: run \`bun run build\` at the root first.`);
}

const entries = Object.entries(files);
const entry = [
  'import { start } from "../src/api";',
  ...entries.map(([, path], i) => {
    const from = relative(genDir, path);
    return `import f${i} from ${JSON.stringify(from)} with { type: "file" };`;
  }),
  "",
  "await start({",
  ...entries.map(([urlPath], i) => `  ${JSON.stringify(urlPath)}: f${i},`),
  "});",
  "",
].join("\n");

await rm(genDir, { recursive: true, force: true });
await mkdir(genDir);
await writeFile(resolve(genDir, "entry.ts"), entry);

const outfile = resolve(root, "dist/select1");
const result = await Bun.build({
  entrypoints: [resolve(genDir, "entry.ts")],
  compile: { target, outfile },
  minify: true,
});
await rm(genDir, { recursive: true, force: true });

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`Built ${relative(process.cwd(), outfile)} with ${entries.length} web files embedded.`);
