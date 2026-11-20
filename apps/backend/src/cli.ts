import type { WebFiles } from "./web";

const usage = `Usage: pg_select1 [command]

Commands:
  serve       Serve the API and the web app (the default)
  user add    Add a user, such as the first admin, and print their set-password link

Run \`pg_select1 user --help\` for its options.`;

/**
 * pg_select1's command line, which the executable, the Docker image and `bun src/cli.ts` all
 * start in: with no command it serves, and `user add` adds a user from the shell.
 *
 * Commands import what they need only once chosen, so `--help` works without any settings.
 *
 * @param webFiles the web app's files, when they're embedded in a compiled executable.
 */
export async function main(args: string[], webFiles?: WebFiles): Promise<void> {
  const [command, ...rest] = args;

  if (command === undefined || command === "serve") {
    const { start } = await import("./api");
    await start(webFiles);
    return;
  }
  if (command === "user") {
    const { runUserCommand } = await import("./modules/user/cli");
    // A one-off command: exiting closes pg_select1's database pools with it.
    process.exit(await runUserCommand(rest));
  }
  if (command === "--help" || command === "-h" || command === "help") {
    console.log(usage);
    return;
  }
  console.error(`Unknown command ${command}.\n\n${usage}`);
  process.exit(1);
}

if (import.meta.main) await main(process.argv.slice(2));
