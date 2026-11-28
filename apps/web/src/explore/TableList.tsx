import type { TableKind, TargetFunction, TargetTable } from "@pg_select1/shared";
import {
  EyeIcon,
  InfoIcon,
  LayersIcon,
  type LucideIcon,
  SquareFunctionIcon,
  Table2Icon,
} from "lucide-react";
import type { MouseEvent } from "react";

import { Clipped } from "@/components/Clipped";
import { CopyButton, hoverButton } from "@/components/CopyButton";
import { sqlTableName } from "@/lib/sql";
import { cn } from "@/lib/utils";

const kindIcons: Record<TableKind, LucideIcon> = {
  table: Table2Icon,
  view: EyeIcon,
  "materialized view": LayersIcon,
  "partitioned table": Table2Icon,
  "foreign table": Table2Icon,
};

// Where each kind goes within its schema: tables of every sort together, then views,
// materialized views and functions last.
const kindOrder: Record<TableKind, number> = {
  table: 0,
  "partitioned table": 0,
  "foreign table": 0,
  view: 1,
  "materialized view": 2,
};

// One row of the list: a table or the like, or a function.
type Item = { table: TargetTable } | { fn: TargetFunction };

// A table's buttons, side by side where its row's buttons go, however wide "Copied" makes one.
const rowButton =
  "static translate-y-0 group-hover/table:opacity-100 group-hover/table:transition-[color,opacity]";

const itemClass =
  "relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-sm text-muted-foreground transition-colors outline-none before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent before:transition-colors group-hover/table:bg-muted group-hover/table:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:text-foreground aria-[current=page]:before:bg-highlight";

/**
 * A connection's tables, views, materialized views and functions, under each schema's name,
 * each with an icon for its kind. `public` comes first, in bold, and the other schemas follow in
 * alphabetical order. Within a schema, its tables come first, then its views, its materialized
 * views and its functions, each by name. Clicking a table calls `onOpen`, and a function
 * `onOpenFunction`; with `href`, each table is a link there too, and otherwise a button. A name
 * too long to fit is shown whole in a tooltip, and hovering a table shows a button that calls
 * `onDescribe`, to show how it's made, and one that copies its name with its schema, quoted for
 * SQL, which is all a function has. `current` is marked as the page shown.
 */
export function TableList({
  connection,
  tables,
  functions,
  current,
  href,
  onOpen,
  onOpenFunction,
  onDescribe,
}: {
  connection: string;
  tables: TargetTable[];
  functions: TargetFunction[];
  current?: { schema: string; name: string };
  href?: (table: TargetTable) => string;
  onOpen: (table: TargetTable) => void;
  onOpenFunction: (fn: TargetFunction) => void;
  onDescribe: (table: TargetTable) => void;
}) {
  if (tables.length === 0 && functions.length === 0) {
    return (
      <p className="animate-fade-in text-sm text-muted-foreground">
        {connection} has no tables to show.
      </p>
    );
  }
  // The API answers each by schema then name, so each schema's are together, and sorting them by
  // kind alone, which keeps their order otherwise, leaves each kind's by name.
  const schemas = new Map<string, Item[]>();
  const add = (schema: string, item: Item) => {
    const inSchema = schemas.get(schema);
    if (inSchema) inSchema.push(item);
    else schemas.set(schema, [item]);
  };
  for (const t of tables.toSorted((a, b) => kindOrder[a.kind] - kindOrder[b.kind])) {
    add(t.schema, { table: t });
  }
  for (const fn of functions) add(fn.schema, { fn });
  const ordered = [...schemas].toSorted(([a], [b]) =>
    a === "public" ? -1 : b === "public" ? 1 : a.localeCompare(b),
  );

  return (
    <nav aria-label="Tables" className="grid animate-fade-in grid-cols-1 content-start gap-3">
      {ordered.map(([schema, inSchema]) => (
        <div key={schema}>
          <h3
            className={cn(
              "px-2 pb-1 text-xs text-muted-foreground",
              schema === "public" ? "font-bold" : "font-medium",
            )}
          >
            {schema}
          </h3>
          <ul>
            {inSchema.map((item) =>
              "fn" in item ? (
                <FunctionItem
                  key={`${item.fn.name}(${item.fn.arguments})`}
                  fn={item.fn}
                  onOpen={onOpenFunction}
                />
              ) : (
                <TableItem
                  key={item.table.name}
                  table={item.table}
                  isCurrent={
                    current?.schema === item.table.schema && current.name === item.table.name
                  }
                  href={href}
                  onOpen={onOpen}
                  onDescribe={onDescribe}
                />
              ),
            )}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// A table's row: its name, to open it, and its buttons to show its structure and copy its name.
function TableItem({
  table: t,
  isCurrent,
  href,
  onOpen,
  onDescribe,
}: {
  table: TargetTable;
  isCurrent: boolean;
  href?: (table: TargetTable) => string;
  onOpen: (table: TargetTable) => void;
  onDescribe: (table: TargetTable) => void;
}) {
  const Icon = kindIcons[t.kind];
  const content = (
    <>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <Clipped text={t.name} className="min-w-0" />
    </>
  );
  const title = t.kind === "table" ? undefined : t.kind;
  return (
    <li className="group/table relative">
      {href ? (
        <a
          href={href(t)}
          title={title}
          aria-current={isCurrent ? "page" : undefined}
          className={itemClass}
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            onOpen(t);
          }}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          title={title}
          className={itemClass}
          onClick={() => {
            onOpen(t);
          }}
        >
          {content}
        </button>
      )}
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-1">
        <button
          type="button"
          aria-label={`Structure of ${t.name}`}
          title="Structure"
          className={cn(hoverButton, rowButton)}
          onClick={() => {
            onDescribe(t);
          }}
        >
          <InfoIcon className="size-3.5" />
        </button>
        <CopyButton value={sqlTableName(t)} label={`Copy ${t.name}`} className={rowButton} />
      </div>
    </li>
  );
}

// A function's row: its name, to open its definition, with its arguments in the tooltip, since
// overloads share a name, and a button to copy its name.
function FunctionItem({
  fn,
  onOpen,
}: {
  fn: TargetFunction;
  onOpen: (fn: TargetFunction) => void;
}) {
  return (
    <li className="group/table relative">
      <button
        type="button"
        title={`function ${fn.name}(${fn.arguments})`}
        className={itemClass}
        onClick={() => {
          onOpen(fn);
        }}
      >
        <SquareFunctionIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <Clipped text={fn.name} className="min-w-0" />
      </button>
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-1">
        <CopyButton value={sqlTableName(fn)} label={`Copy ${fn.name}`} className={rowButton} />
      </div>
    </li>
  );
}
