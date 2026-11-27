#!/usr/bin/env -S bun
import type { Contract as Start } from '../../snapshots/2c55bf481508c6c0cc1c40e2fc7568c1e18028329a9373621b78e0340bf8426f/contract';
import startContract from '../../snapshots/2c55bf481508c6c0cc1c40e2fc7568c1e18028329a9373621b78e0340bf8426f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9d167ea7ddff1afc00680a370a310f8808198a6f082f58e7e7ca5f7da346dd2c/contract';
import endContract from '../../snapshots/9d167ea7ddff1afc00680a370a310f8808198a6f082f58e7e7ca5f7da346dd2c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('theme', 'text', {
          notNull: true,
          default: lit('system'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_theme_check_3edaffe7',
        expression: sql`"theme" IN ('system', 'light', 'dark')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
