#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/1ce8739942c600bbc63a4f46402371d2a50ba7d0ea82c8b7409417fbf42ca995/contract';
import endContract from '../../snapshots/1ce8739942c600bbc63a4f46402371d2a50ba7d0ea82c8b7409417fbf42ca995/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e86b303d034c2e126caf021ebc27676729521cd27defb8a6dbba454b5e2bc03f/contract';
import startContract from '../../snapshots/e86b303d034c2e126caf021ebc27676729521cd27defb8a6dbba454b5e2bc03f/contract.json' with { type: 'json' };
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
        table: 'connections',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('database', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('encrypted_password', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('host', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('port', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ssl_mode', 'text', {
            notNull: true,
            default: lit('require'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('username', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('visible', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'connections_ssl_mode_check_4d8cb273',
            sql`"ssl_mode" IN ('disable', 'require', 'verify-full')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'connections',
        constraint: 'connections_name_key',
        columns: ['name'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
