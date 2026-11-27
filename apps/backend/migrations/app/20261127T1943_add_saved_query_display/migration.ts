#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/805b7f664aa74aab988cb618ab66691574d316d2896195cf4240d850a3c3f30b/contract';
import endContract from '../../snapshots/805b7f664aa74aab988cb618ab66691574d316d2896195cf4240d850a3c3f30b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9d167ea7ddff1afc00680a370a310f8808198a6f082f58e7e7ca5f7da346dd2c/contract';
import startContract from '../../snapshots/9d167ea7ddff1afc00680a370a310f8808198a6f082f58e7e7ca5f7da346dd2c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'dashboard_items',
        constraint: 'dashboard_items_visualization_check_58801661',
      }),
      this.dropColumn({ schema: 'public', table: 'dashboard_items', column: 'visualization' }),
      this.addColumn({
        schema: 'public',
        table: 'saved_queries',
        column: col('chart_kind', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'saved_queries',
        column: col('chart_x', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'saved_queries',
        column: col('chart_y', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'saved_queries',
        column: col('display', 'text', {
          notNull: true,
          default: lit('table'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'saved_queries',
        constraint: 'saved_queries_chart_kind_check_cabe5888',
        expression: sql`"chart_kind" IN ('bar', 'line', 'area', 'pie')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'saved_queries',
        constraint: 'saved_queries_display_check_65cd5e70',
        expression: sql`"display" IN ('table', 'chart', 'number')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
