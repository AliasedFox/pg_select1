#!/usr/bin/env -S bun
import type { Contract as Start } from '../../snapshots/5e05024350a46c468507619ad6ba4c0281b627b33a1ba8efca4266f49e4cc265/contract';
import startContract from '../../snapshots/5e05024350a46c468507619ad6ba4c0281b627b33a1ba8efca4266f49e4cc265/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c3259ff0428e28164a9cc5027e87d244c36bedc1fa03444103cfb14b44b3671d/contract';
import endContract from '../../snapshots/c3259ff0428e28164a9cc5027e87d244c36bedc1fa03444103cfb14b44b3671d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'dashboard_items',
        column: col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'dashboards',
        column: col('refresh_minutes', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.dropNotNull({ schema: 'public', table: 'dashboard_items', column: 'saved_query_id' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
