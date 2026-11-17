import "dotenv/config";
import { definePrismaConfig } from "@prisma/cli-engine";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./src/prisma/contract.ts",
    output: "./src/prisma/generated",
    db: {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- the CLI reports a missing URL itself
      connection: process.env.DATABASE_URL!,
    },
  }),
});
