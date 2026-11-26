#!/usr/bin/env -S bun
import type { Contract as Start } from '../../snapshots/1ce8739942c600bbc63a4f46402371d2a50ba7d0ea82c8b7409417fbf42ca995/contract';
import startContract from '../../snapshots/1ce8739942c600bbc63a4f46402371d2a50ba7d0ea82c8b7409417fbf42ca995/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5c0d7a010aa3297dd2f93fc676650b8c92918322a45711cd35e2a56896e4e2a5/contract';
import endContract from '../../snapshots/5c0d7a010aa3297dd2f93fc676650b8c92918322a45711cd35e2a56896e4e2a5/contract.json' with { type: 'json' };
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
        table: 'saved_queries',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('owner_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('scope', 'text', {
            notNull: true,
            default: lit('personal'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('sql', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'saved_queries_scope_check_2736efd0',
            sql`"scope" IN ('personal', 'global')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'saved_query_connections',
        columns: [
          col('connection_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('saved_query_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['saved_query_id', 'connection_id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'saved_queries',
        index: 'saved_queries_owner_id_idx_ade9f347',
        columns: ['owner_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'saved_query_connections',
        index: 'saved_query_connections_connection_id_idx_6326007a',
        columns: ['connection_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'saved_query_connections',
        index: 'saved_query_connections_saved_query_id_idx_05dd5900',
        columns: ['saved_query_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'saved_queries',
        foreignKey: {
          name: 'saved_queries_owner_id_fkey',
          columns: ['owner_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'saved_query_connections',
        foreignKey: {
          name: 'saved_query_connections_saved_query_id_fkey',
          columns: ['saved_query_id'],
          references: { schema: 'public', table: 'saved_queries', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'saved_query_connections',
        foreignKey: {
          name: 'saved_query_connections_connection_id_fkey',
          columns: ['connection_id'],
          references: { schema: 'public', table: 'connections', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
