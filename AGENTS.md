# AGENTS.md

Instructions for AI coding agents in this repo. `CLAUDE.md` only imports this file.

> **Status:** nothing is scaffolded yet. `docs/stack.md` is the plan; as pieces land, add their commands and conventions here.

## Product rules

select1 is an open-source SQL database explorer and alerting tool that people run themselves, on a laptop against their local database or on a server against production.

- **Two kinds of database.** select1's own database holds its users, connections, saved queries and alerts, and Prisma owns it. Target databases are the ones people explore and alert on: reach them only with `pg` and plain SQL, never Prisma, and never migrate them.
- **Safe by default on target databases.** Connections are read-only unless explicitly marked writable. Queries run in `READ ONLY` transactions with a `statement_timeout` and a row cap, and can be cancelled. Don't add a way around these unless asked.
- **Credentials stay secret.** Connection passwords and strings are encrypted at rest, never logged, and never sent back to the browser.
- **Alerts notify on change.** An alert notifies when it goes from ok to triggered and again when it resolves, not on every run. Channels are Slack and webhooks; there's no email.
- **Self-hosted, nothing else required.** select1 runs with only Postgres. Don't add a dependency on a third-party service or a separate process (Redis, a queue) unless asked.
- **Apache 2.0.** Only add dependencies under permissive licenses (MIT, BSD, ISC, Apache).

## Stack

TypeScript on Bun, as runtime and package manager: `bun install`, `bun add`, `bun run`, never npm, yarn or pnpm; commit `bun.lock`.

- Frontend: React with Vite, Tailwind CSS v4 and shadcn/ui, CodeMirror for the SQL editor, TanStack Table and Virtual for results
- Backend: Express, Zod, Prisma 8 (release candidate for now) on PostgreSQL, `pg` for target databases, pg-boss for background jobs, Better Auth for sign-in
- Shipping: one process serves the API and the web app, as a Docker image and as `bun build --compile` executables

`docs/stack.md` has the full list and where each lives.

## Code comments

- **Every exported function, React components included, has a `/** */` doc comment.** It starts with a sentence on what the function does or answers, not its name again; then, when there's more to say, its side effects, its limits and why it works as it does. Other exports take one in the same form whenever they need explaining.
- **Tags only where they say what the types don't:** `@throws`, `{@link name}`, `@deprecated`, and `@param` for a parameter its name and type don't explain. Never `@param` or `@returns` just to fill them in.
- What a module keeps to itself gets a short `//` comment, or none when it's obvious, and so do lines within a function, on why they do what they do.
- Disable a lint rule only on one line, with a reason: `// oxlint-disable-next-line <rule> -- <why>`, between the doc comment and the declaration. Tests, stories and shadcn/ui's components (`components/ui/`) don't need doc comments.

## Database

- Prisma 8, on its release candidate until 8.0.0 is out. Its docs and guides are new: check them rather than going by Prisma 7 habits (`schema.prisma`, `prisma generate`, `prisma migrate dev` are gone).
- One schema for the whole backend, in TypeScript: `apps/backend/src/prisma/contract.ts`, built with `defineContract`. Not `.prisma` files, and not one file per module. Every table is in the `public` Postgres schema.
- After changing it, run `prisma contract emit` (writes `contract.json` and `contract.d.ts` into `src/prisma/generated/`; commit them with the contract), then `prisma migration plan` to write the migration and `prisma db migrate` to apply it. Name migrations for what they change, e.g. `add_alert_channels`.

## Colors

- Black, white and greys (shadcn/ui's neutral theme, in `apps/web/src/index.css`, light and dark), plus the slate grey `#5c5f66`.
- A touch of chartreuse yellow `#e8f04a`, as `highlight`, for small marks only (the current page, dots, step numbers, pills). Always black text on yellow, never yellow text on white.
- Green (`success`) for what's fine, like an alert that's ok or resolved; red (`destructive`) for errors and triggered alerts.
- No other accents: no blue links, no gold. `docs/stack.md` lists every color.

## Agent skills

Skills live in `.agents/skills/<name>/SKILL.md`, linked from `.claude/skills`. `create-pr` formats the code, fixes lint and runs `bun run check` before opening a PR.
