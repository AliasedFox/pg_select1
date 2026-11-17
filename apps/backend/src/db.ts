import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";

import { readEnv } from "./env";
import type { Contract } from "./prisma/generated/contract.d.ts";
import contractJson from "./prisma/generated/contract.json" with { type: "json" };

/** select1's own database contract, as `prisma contract emit` last wrote it. */
export const contract = contractFromJson<Contract>(contractJson);

/**
 * The Prisma client for select1's own database, one pool for the process's lifetime.
 *
 * Never use it for target databases: those go through `pg` in `targets.ts`.
 */
export const db = postgres({ contract, url: readEnv().DATABASE_URL });
