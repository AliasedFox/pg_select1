# AGENTS.md

Instructions for AI coding agents in this repo. `CLAUDE.md` only imports this file.

## Product rules

pg_select1 is an open-source explorer and alerting tool for PostgreSQL databases that people run themselves, on a laptop against their local database or on a server against production.

- **Postgres only.** pg_select1 explores and alerts on PostgreSQL databases and nothing else. Don't add support for another database.
- **One connection direct, several through postgres_fdw.** pg_select1's own database holds its users, connections, saved queries and alerts, and Prisma owns its `public` schema. Target databases are the ones people explore and alert on. Every query, saved query and alert names its connections. A query on one connection runs directly on that target with `pg`. A query on two or more runs in pg_select1's database as `select1_query`, on postgres_fdw foreign tables, and that's the only time postgres_fdw is used. Never send a one-connection query through postgres_fdw, and never work out a query's connections from its SQL. Never use Prisma on a target, and never migrate one. `docs/queries.md` has the design.
- **Safe by default on target databases.** Connections are read-only unless explicitly marked writable. On both paths, queries run in `READ ONLY` transactions with a `statement_timeout` and a row cap, and can be cancelled. Across connections they also run as the `select1_query` role, which can't read pg_select1's own tables. Don't add a way around these unless asked.
- **Credentials stay secret.** Connection passwords and strings are encrypted at rest in pg_select1's tables, decrypted only in the API's memory to open a connection's pool, never logged, and never sent back to the browser. The only plain copy is the postgres_fdw user mapping of a connection used across connections: never grant `select1_query` `USAGE` on a foreign server, which would let it read it.
- **Alerts notify on change.** An alert notifies when it goes from ok to triggered and again when it resolves, not on every run. Channels are Slack and webhooks; there's no email.
- **Self-hosted, nothing else required.** pg_select1 runs with only Postgres. postgres_fdw is optional: where pg_select1's database has it, queries across connections work, and where it doesn't (Render's managed Postgres, Heroku's Essential plans), everything else still does. Don't add a dependency on a third-party service, another extension or a separate process (Redis, a queue) unless asked.
- **Named pg_select1.** The product, its database, packages (`@pg_select1/*`), image, executable and settings (`PG_SELECT1_*`) are `pg_select1`. Postgres reserves role and schema names that start with `pg_`, so the roles are `select1` and `select1_query`.
- **Apache 2.0.** Only add dependencies under permissive licenses (MIT, BSD, ISC, Apache).

## Stack

TypeScript on Bun, as runtime and package manager: `bun install`, `bun add`, `bun run`, never npm, yarn or pnpm; commit `bun.lock`.

- Frontend: React with Vite, Tailwind CSS v4 and shadcn/ui, CodeMirror for the SQL editor, TanStack Table and Virtual for results
- Backend: Express, Zod, Prisma 8 (release candidate for now) on PostgreSQL, `pg` for target databases, postgres_fdw (optional) for queries across them, pg-boss for background jobs, Better Auth for sign-in
- Shipping: one process serves the API and the web app, as a Docker image and as `bun build --compile` executables

`docs/stack.md` has the full list and where each lives.

## Commands

Run from the repo root unless noted.

| Command                | What it does                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `bun run up`           | The local stack in Docker with hot reload: Postgres, migrations, API, web, Storybook, pgweb |
| `bun run down`         | Stops it                                                                                    |
| `bun run dev`          | API and web dev server without Docker (needs `apps/backend/.env` and a Postgres)            |
| `bun run check`        | Typecheck, lint, format check and tests, each one's output prefixed with its name           |
| `bun run lint:fix`     | oxlint, type-aware, fixing what it can                                                      |
| `bun run format`       | oxfmt over everything                                                                       |
| `bun run build`        | Builds the web app into `apps/web/dist`                                                     |
| `bun run build:binary` | Builds the web app, then `apps/backend/dist/pg_select1`, one executable with it embedded    |

In `apps/backend`: `bun run db:emit`, `bun run db:plan <name>`, `bun run db:migrate` (Prisma, see below). In `apps/web`: `bun run storybook`.

Ports: pg_select1's Postgres 5440, API 3100, web 5180, Storybook 6016, pgweb 8091.

- pgweb (http://localhost:8091) is temporary: it browses pg_select1's own database until pg_select1's explorer can, then it goes. Don't build on it.

- Run the Prisma CLI with `bun --bun prisma ...` (the `db:*` scripts do), since the contract is TypeScript, and with `DO_NOT_TRACK=1` to keep its telemetry off.
- Backend tests start their own Postgres with Testcontainers (`apps/backend/test/setup.ts`), so Docker must be running. Tests of queries across connections put the target databases on a Docker network shared with pg_select1's, since postgres_fdw connects from inside its container. Drive the API through `request()` from `test/api.ts`.
- Web tests render the whole app with `renderApp(path)` from `apps/web/test/render.tsx`, against the fake API in `test/fixtures.ts`, which Storybook uses too. Override a route with `server.use()` in a test and `msw.use()` in a story's `beforeEach`.

## Code comments

- **Every exported function, React components included, has a `/** */` doc comment.** It starts with a sentence on what the function does or answers, not its name again; then, when there's more to say, its side effects, its limits and why it works as it does. Other exports take one in the same form whenever they need explaining.
- **Tags only where they say what the types don't:** `@throws`, `{@link name}`, `@deprecated`, and `@param` for a parameter its name and type don't explain. Never `@param` or `@returns` just to fill them in.
- What a module keeps to itself gets a short `//` comment, or none when it's obvious, and so do lines within a function, on why they do what they do.
- Disable a lint rule only on one line, with a reason: `// oxlint-disable-next-line <rule> -- <why>`, between the doc comment and the declaration. Tests, stories and shadcn/ui's components (`components/ui/`) don't need doc comments.

## Database

- Prisma 8, on its release candidate until 8.0.0 is out. Its docs and guides are new: check them rather than going by Prisma 7 habits (`schema.prisma`, `prisma generate`, `prisma migrate dev` are gone).
- One schema for the whole backend, in TypeScript: `apps/backend/src/prisma/contract.ts`, built with `defineContract`. Not `.prisma` files, and not one file per module. Every table is in the `public` Postgres schema.
- The other schemas in pg_select1's database aren't Prisma's. pg-boss keeps `pgboss`, and the `connection` module creates and drops the foreign-table schemas of connections used across connections at runtime (`<name>`, `<name>__<schema>`). Never put them in the contract. postgres_fdw is created by a check at start-up, not by a migration, because it's optional and some hosts don't have it.
- After changing it, run `bun run db:emit` (writes `contract.json` and `contract.d.ts` into `src/prisma/generated/`; commit them with the contract), then `bun run db:plan <name>` to write the migration into `apps/backend/migrations/` and `bun run db:migrate` to apply it. Name migrations for what they change, e.g. `add_alert_channels`. Never edit a planned migration's `ops.json` or format the migrations: they're hashed.
- Prisma 8's own guide for agents ships inside the package: `apps/backend/node_modules/@prisma/orm-postgres/skills/prisma-8/`. Read its `SKILL.md` and the reference for the task before writing Prisma code.

## Colors

- Black, white and greys (shadcn/ui's neutral theme, in `apps/web/src/index.css`, light and dark), plus the slate grey `#5c5f66`.
- A touch of chartreuse yellow `#e8f04a`, as `highlight`, for small marks only (the current page, dots, step numbers, pills). Always black text on yellow, never yellow text on white.
- Green (`success`) for what's fine, like an alert that's ok or resolved; red (`destructive`) for errors and triggered alerts.
- No other accents: no blue links, no gold. `docs/stack.md` lists every color.

## Agent skills

Skills live in `.agents/skills/<name>/SKILL.md`, linked from `.claude/skills`, and subagents in `.agents/agents/<name>.md`, linked from `.claude/agents`. `create-pr` formats the code, fixes lint and runs `bun run check` before opening a PR, and, when asked for a review too ("create a PR and review"), has the `code-reviewer` agent review the PR and post its findings on it.
