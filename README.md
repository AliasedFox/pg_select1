# select1

SQL database explorer & real-time alerting system.

select1 is an open-source tool for looking at your data — the same way, whether
it's your local database while you develop or your production database when you
need to know what's really going on. On top of exploring, it lets you define
**alerts**: SQL-backed conditions that notify you when your data does something
it shouldn't.

Think of it as a cross between [pgweb](https://github.com/sosedoff/pgweb)
(a lightweight database browser) and [Redash](https://github.com/getredash/redash)
/ [Metabase](https://github.com/metabase/metabase) (saved queries and alerts),
built to be equally at home on a laptop and on a server.

> **Status:** early development. Nothing here is stable yet.

## Why

During development you want a fast, no-ceremony way to poke at tables, run a
query, and check what your code just wrote. In production you want the same
thing, plus guardrails, plus a way to be told when something goes wrong —
without wiring up a full BI stack. select1 aims to be one tool for both.

## Features

### Explore (local & production)

- Connect to one or more databases (PostgreSQL first)
- Browse schemas, tables, columns, indexes, and constraints
- Run ad-hoc SQL with a proper editor and inspect results
- Save, name, and re-run queries
- Read-only mode and safe defaults for production connections

### Alerts (mostly production)

- Define an alert as a SQL query plus a condition
  (e.g. "row count > 0", "value above threshold", "result changed")
- Run alerts on a schedule
- Get notified when an alert triggers, and again when it resolves
- Pluggable notification channels (e.g. email, Slack, webhooks)

## Use cases

- **Local development** — check what a migration did, inspect rows your feature
  just created, debug a query before putting it in code.
- **Production inspection** — answer "what does this record actually look
  like?" without handing out psql access.
- **Data monitoring** — get pinged when failed payments spike, a queue table
  stops draining, orphaned rows appear, or a nightly job didn't write anything.

## Tech stack

- TypeScript
- [Bun](https://bun.sh) / Node.js
- React
- [Prisma](https://www.prisma.io)
- PostgreSQL

## Getting started

Setup instructions will be added once there is something to run.

## Contributing

Contributions, ideas, and bug reports are welcome — open an issue or a pull
request.

## License

select1 is open source under the [Apache License 2.0](LICENSE).
