#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/2c55bf481508c6c0cc1c40e2fc7568c1e18028329a9373621b78e0340bf8426f/contract';
import endContract from '../../snapshots/2c55bf481508c6c0cc1c40e2fc7568c1e18028329a9373621b78e0340bf8426f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5c0d7a010aa3297dd2f93fc676650b8c92918322a45711cd35e2a56896e4e2a5/contract';
import startContract from '../../snapshots/5c0d7a010aa3297dd2f93fc676650b8c92918322a45711cd35e2a56896e4e2a5/contract.json' with { type: 'json' };
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
        table: 'dashboard_items',
        columns: [
          col('dashboard_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('saved_query_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('visualization', 'text', {
            notNull: true,
            default: lit('table'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'dashboard_items_visualization_check_58801661',
            sql`"visualization" IN ('table')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'dashboards',
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
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'dashboards_scope_check_2736efd0',
            sql`"scope" IN ('personal', 'global')`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'dashboard_items',
        index: 'dashboard_items_dashboard_id_idx_115aeb8e',
        columns: ['dashboard_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'dashboard_items',
        index: 'dashboard_items_saved_query_id_idx_05dd5900',
        columns: ['saved_query_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'dashboards',
        index: 'dashboards_owner_id_idx_ade9f347',
        columns: ['owner_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'dashboard_items',
        foreignKey: {
          name: 'dashboard_items_dashboard_id_fkey',
          columns: ['dashboard_id'],
          references: { schema: 'public', table: 'dashboards', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'dashboard_items',
        foreignKey: {
          name: 'dashboard_items_saved_query_id_fkey',
          columns: ['saved_query_id'],
          references: { schema: 'public', table: 'saved_queries', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'dashboards',
        foreignKey: {
          name: 'dashboards_owner_id_fkey',
          columns: ['owner_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
