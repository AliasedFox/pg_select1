# pg_select1's release image: the API with the web app built in, on one port. Build it from the repo
# root: `docker build -f apps/backend/Dockerfile .`. It applies migrations, then serves. Its
# `pg_select1` command is the same CLI as the executable's: `docker exec <container> pg_select1
# user add --admin you@example.com` adds the first admin.

FROM oven/bun:1.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM deps AS web
RUN bun install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN bun run --filter '@pg_select1/web' build

FROM deps AS runtime
RUN bun install --frozen-lockfile --production --filter '@pg_select1/backend'
COPY packages/shared/src packages/shared/src
COPY apps/backend/prisma.config.ts apps/backend/
COPY apps/backend/migrations apps/backend/migrations
COPY apps/backend/src apps/backend/src
COPY --from=web /app/apps/web/dist apps/web/dist

RUN printf '#!/bin/sh\nexec bun /app/apps/backend/src/cli.ts "$@"\n' > /usr/local/bin/pg_select1 \
  && chmod +x /usr/local/bin/pg_select1

ENV NODE_ENV=production PORT=3100 DO_NOT_TRACK=1
USER bun
WORKDIR /app/apps/backend
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["sh", "-c", "bun run db:migrate && exec bun src/cli.ts serve"]
