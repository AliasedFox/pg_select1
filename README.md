# pg_select1

PostgreSQL explorer & real-time alerting system.

pg_select1 is an open-source tool for looking at the data in your PostgreSQL
databases — the same way, whether it's your local database while you develop or
your production database when you need to know what's really going on. On top of
exploring, it lets you define **alerts**: SQL-backed conditions that notify you
when your data does something it shouldn't.

It's Postgres all the way down. A query on one database runs directly on it, and
one query can join tables from several databases, through
[postgres_fdw](https://www.postgresql.org/docs/current/postgres-fdw.html) in
pg_select1's own Postgres database.

Think of it as a cross between [pgweb](https://github.com/sosedoff/pgweb)
(a lightweight database browser) and [Redash](https://github.com/getredash/redash)
/ [Metabase](https://github.com/metabase/metabase) (saved queries and alerts),
built to be equally at home on a laptop and on a server.

> **Status:** early development. Nothing here is stable yet.

## Why

During development you want a fast, no-ceremony way to poke at tables, run a
query, and check what your code just wrote. In production you want the same
thing, plus guardrails, plus a way to be told when something goes wrong —
without wiring up a full BI stack. pg_select1 aims to be one tool for both.

## Features

### Explore (local & production)

- Connect to one or more PostgreSQL databases
- Browse schemas, tables, columns, indexes, and constraints
- Run ad-hoc SQL with a proper editor and inspect results
- Query across databases: add a second connection to a query, and
  `select ... from orders join crm.customers ...` just works
- Save, name, and re-run queries
- Read-only mode and safe defaults for production connections

### Alerts (mostly production)

- Define an alert as a SQL query plus a condition
  (e.g. "row count > 0", "value above threshold", "result changed")
- Alert on one database, or on how several disagree (paid orders in one with no
  invoice in another)
- Run alerts on a schedule
- Get notified when an alert triggers, and again when it resolves
- Notification channels: Slack and webhooks

## How it works

pg_select1 keeps its users, connections, saved queries and alerts in a Postgres
database of its own. Every query names the connections it reads:

- **One connection**: pg_select1 runs the query directly on that database, so
  the SQL you'd write against the database itself works as it is.
- **Two or more**: the query runs in pg_select1's database, where the
  [postgres_fdw](https://www.postgresql.org/docs/current/postgres-fdw.html)
  extension makes each connection's tables foreign tables in a schema named
  after it. Each database filters its own rows, and pg_select1's database
  joins them.

postgres_fdw is optional. Most Postgres hosts have it. Where pg_select1's
database doesn't (Render's managed Postgres, Heroku's Essential plans), queries
across connections are off and everything else works.

Queries are read-only unless a connection is marked writable, with a timeout and
a row cap. [docs/queries.md](docs/queries.md) has the details.

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
- PostgreSQL 15 or later, and postgres_fdw for queries across databases

## Getting started

There's nothing to use yet beyond signing in, managing users and a health page,
but the project runs. You need [Bun](https://bun.sh) 1.3 or later and Docker.

```sh
bun install
bun run up       # Postgres, migrations, API, web app, Storybook and pgweb, with hot reload
bun run user:add you@example.com --admin   # in another terminal: the first admin
```

Nobody can sign up: admins invite people from the Users page, and `user add`
makes the first admin. Either way you get a link to set a password with, valid
for 7 days; pg_select1 doesn't send email, so you pass it on yourself. On a
server, run the same command in pg_select1's container
(`docker exec <container> pg_select1 user add you@example.com --admin`) or with
the executable (`pg_select1 user add ...`), with `PG_SELECT1_URL` set to the
address people open pg_select1 at, so the link points there.

Then open:

| What                  | URL                                                      |
| --------------------- | -------------------------------------------------------- |
| Web app               | http://localhost:5190                                    |
| API health check      | http://localhost:3100/health                             |
| Storybook             | http://localhost:6026                                    |
| pgweb (temporary)     | http://localhost:8091                                    |
| pg_select1's Postgres | `postgresql://select1:select1@localhost:5440/pg_select1` |

The role is `select1`, not `pg_select1`, because Postgres reserves role names
starting with `pg_`. pgweb browses pg_select1's own database until pg_select1
can do it itself, then it goes. `bun run check` runs the typecheck, linter,
format check and tests.

## Contributing

Contributions, ideas, and bug reports are welcome — open an issue or a pull
request.

## License

pg_select1 is open source under the [Apache License 2.0](LICENSE).
