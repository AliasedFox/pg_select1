import { defineContract } from "@prisma/orm-postgres/contract-builder";

/**
 * The schema of select1's own database, every table in the `public` schema.
 *
 * After changing it, run `prisma contract emit`, then `prisma migration plan --name <change>`
 * and `prisma db migrate`. Target databases are never described here.
 */
export const contract = defineContract({}, () => ({
  models: {},
}));
