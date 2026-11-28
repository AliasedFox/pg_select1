import type { TableKind, TableStructure, TargetTable } from "@pg_select1/shared";
import { KeyRoundIcon } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { Loading } from "@/components/Loading";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLoaded } from "@/lib/loaded";

import { fetchStructure } from "./api";

// What each kind of table can have, so a view isn't said to have no indexes, which it can't.
const has: Record<TableKind, { constraints: boolean; indexes: boolean; triggers: boolean }> = {
  table: { constraints: true, indexes: true, triggers: true },
  "partitioned table": { constraints: true, indexes: true, triggers: true },
  view: { constraints: false, indexes: false, triggers: true },
  "materialized view": { constraints: false, indexes: true, triggers: false },
  "foreign table": { constraints: true, indexes: false, triggers: true },
};

// A part of the structure, under its name and how many it holds, or saying there are none.
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="text-sm font-medium">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{count}</span>
        )}
      </h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">None.</p> : children}
    </section>
  );
}

// One of a section's entries: its name, what marks it out, and how it's defined, as SQL.
function Entry({
  name,
  marks,
  detail,
  definition,
}: {
  name: string;
  marks?: ReactNode;
  detail?: string | null;
  definition: string;
}) {
  return (
    <li className="grid gap-1 rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm break-all">{name}</span>
        {marks}
        {detail && <span className="ml-auto text-xs text-muted-foreground">{detail}</span>}
      </div>
      <code className="font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
        {definition}
      </code>
    </li>
  );
}

// What's said of a table under its name: its kind, about how many rows, its size and comment.
function describe({ kind, rowEstimate, size }: TableStructure): string {
  const parts: string[] = [kind];
  if (rowEstimate !== null) {
    parts.push(`about ${Math.round(rowEstimate).toLocaleString()} rows`);
  }
  if (size !== null) parts.push(size);
  return parts.join(" · ");
}

// The structure once it's loaded, by section, each only where the table's kind can have it.
function Structure({ structure }: { structure: TableStructure }) {
  const can = has[structure.kind];
  return (
    <div className="grid min-w-0 animate-fade-in gap-5">
      <Section title="Columns" count={structure.columns.length}>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Nullable</TableHead>
                <TableHead>Default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {structure.columns.map((column) => (
                <TableRow key={column.name}>
                  <TableCell className="align-top font-mono whitespace-normal">
                    <span className="flex items-center gap-1.5 break-all">
                      {column.name}
                      {column.primaryKey && (
                        <span title="Primary key" className="shrink-0 text-muted-foreground">
                          <KeyRoundIcon aria-hidden="true" className="size-3.5" />
                          <span className="sr-only">, primary key</span>
                        </span>
                      )}
                    </span>
                    {column.comment && (
                      <span className="block font-sans text-xs text-muted-foreground">
                        {column.comment}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="align-top font-mono text-muted-foreground">
                    {column.type}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {column.notNull ? "not null" : "null"}
                  </TableCell>
                  <TableCell className="align-top font-mono break-all whitespace-normal text-muted-foreground">
                    {column.default}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {can.constraints && (
        <Section title="Constraints" count={structure.constraints.length}>
          <ul className="grid gap-2">
            {structure.constraints.map((c) => (
              <Entry
                key={c.name}
                name={c.name}
                marks={<Badge variant="outline">{c.type}</Badge>}
                definition={c.definition}
              />
            ))}
          </ul>
        </Section>
      )}

      {can.indexes && (
        <Section title="Indexes" count={structure.indexes.length}>
          <ul className="grid gap-2">
            {structure.indexes.map((index) => (
              <Entry
                key={index.name}
                name={index.name}
                marks={
                  <>
                    {index.primary && <Badge variant="outline">primary key</Badge>}
                    {index.unique && !index.primary && <Badge variant="outline">unique</Badge>}
                    {!index.valid && <Badge variant="destructive">invalid</Badge>}
                  </>
                }
                detail={index.size}
                definition={index.definition}
              />
            ))}
          </ul>
        </Section>
      )}

      {can.triggers && (
        <Section title="Triggers" count={structure.triggers.length}>
          <ul className="grid gap-2">
            {structure.triggers.map((trigger) => (
              <Entry
                key={trigger.name}
                name={trigger.name}
                marks={!trigger.enabled && <Badge variant="secondary">disabled</Badge>}
                definition={trigger.definition}
              />
            ))}
          </ul>
        </Section>
      )}

      {/* Only tables are referred to, and most aren't, so it's left out when none are. */}
      {structure.referencedBy.length > 0 && (
        <Section title="Referenced by" count={structure.referencedBy.length}>
          <ul className="grid gap-2">
            {structure.referencedBy.map((ref) => (
              <Entry
                key={`${ref.schema}.${ref.table}.${ref.name}`}
                name={`${ref.schema}.${ref.table}`}
                detail={ref.name}
                definition={ref.definition}
              />
            ))}
          </ul>
        </Section>
      )}

      {structure.partitionKey !== null && (
        <Section title="Partitions" count={structure.partitions.length}>
          <p className="font-mono text-xs text-muted-foreground">
            PARTITION BY {structure.partitionKey}
          </p>
          <ul className="grid gap-2">
            {structure.partitions.map((partition) => (
              <Entry
                key={`${partition.schema}.${partition.name}`}
                name={`${partition.schema}.${partition.name}`}
                definition={partition.bound}
              />
            ))}
          </ul>
        </Section>
      )}

      {structure.definition !== null && (
        <Section title="Definition">
          <pre className="overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs">
            {structure.definition.trim()}
          </pre>
        </Section>
      )}
    </div>
  );
}

/**
 * Shows how one of a connection's tables is made, loaded from its database as it opens: its
 * columns, with the primary key's marked, then the constraints, indexes and triggers its kind
 * can have, the foreign keys that refer to it, a partitioned table's partitions and a view's
 * definition.
 */
export function TableStructureDialog({
  connectionId,
  table,
  onOpenChange,
}: {
  connectionId: string;
  table: TargetTable;
  onOpenChange: (open: boolean) => void;
}) {
  const load = useMemo(() => () => fetchStructure(connectionId, table), [connectionId, table]);
  const structure = useLoaded(load);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* The dialog scrolls, rather than a part of it, so its close button reaches it by keyboard. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-mono break-all">
            {table.schema}.{table.name}
          </DialogTitle>
          {/* Keyed, so what's said once it's loaded fades in. */}
          <DialogDescription
            key={structure.kind}
            className={structure.kind === "loaded" ? "animate-fade-in" : undefined}
          >
            {structure.kind === "loaded" ? describe(structure.value) : table.kind}
          </DialogDescription>
          {structure.kind === "loaded" && structure.value.comment && (
            <p className="animate-fade-in text-sm">{structure.value.comment}</p>
          )}
        </DialogHeader>
        {structure.kind === "loading" && <Loading className="min-h-40" />}
        {structure.kind === "failed" && (
          <p role="alert" className="animate-fade-in text-sm text-destructive">
            Couldn't load its structure: {structure.message}
          </p>
        )}
        {structure.kind === "loaded" && <Structure structure={structure.value} />}
      </DialogContent>
    </Dialog>
  );
}
