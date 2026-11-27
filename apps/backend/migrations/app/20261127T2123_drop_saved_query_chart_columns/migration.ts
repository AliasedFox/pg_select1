#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/5e05024350a46c468507619ad6ba4c0281b627b33a1ba8efca4266f49e4cc265/contract';
import endContract from '../../snapshots/5e05024350a46c468507619ad6ba4c0281b627b33a1ba8efca4266f49e4cc265/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/805b7f664aa74aab988cb618ab66691574d316d2896195cf4240d850a3c3f30b/contract';
import startContract from '../../snapshots/805b7f664aa74aab988cb618ab66691574d316d2896195cf4240d850a3c3f30b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: 'public', table: 'saved_queries', column: 'chart_x' }),
      this.dropColumn({ schema: 'public', table: 'saved_queries', column: 'chart_y' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
