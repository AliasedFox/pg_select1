#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/6c8637c4a79aac05b7f0afc2952d16bc072526f518481461b9a7cd99fc7f8657/contract';
import endContract from '../../snapshots/6c8637c4a79aac05b7f0afc2952d16bc072526f518481461b9a7cd99fc7f8657/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c3259ff0428e28164a9cc5027e87d244c36bedc1fa03444103cfb14b44b3671d/contract';
import startContract from '../../snapshots/c3259ff0428e28164a9cc5027e87d244c36bedc1fa03444103cfb14b44b3671d/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'settings',
        columns: [
          col('catalog_refresh_minutes', 'int4', {
            notNull: true,
            default: lit(15),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('settings_one_row_7faf435e', sql`id = 1`),
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
