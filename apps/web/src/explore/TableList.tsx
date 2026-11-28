import type { TableKind, TargetTable } from "@pg_select1/shared";
import { EyeIcon, InfoIcon, LayersIcon, type LucideIcon, Table2Icon } from "lucide-react";
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

// A table's buttons, side by side where its row's buttons go, however wide "Copied" makes one.
const rowButton =
  "static translate-y-0 group-hover/table:opacity-100 group-hover/table:transition-[color,opacity]";

const itemClass =
  "relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-sm text-muted-foreground transition-colors outline-none before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent before:transition-colors group-hover/table:bg-muted group-hover/table:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:text-foreground aria-[current=page]:before:bg-highlight";

/**
 * A connection's tables, under each schema's name, each with an icon for its kind. `public` comes
 * first, in bold, and the other schemas follow in alphabetical order. Clicking one
 * calls `onOpen`; with `href`, each is a link there too, and otherwise a button. A name too long
 * to fit is shown whole in a tooltip, and hovering one shows a button that calls `onDescribe`,
 * to show how it's made, and one that copies its name with its schema, quoted for SQL. `current`
 * is marked as the page shown.
 */
export function TableList({
  connection,
  tables,
  current,
  href,
  onOpen,
  onDescribe,
}: {
  connection: string;
  tables: TargetTable[];
  current?: { schema: string; name: string };
  href?: (table: TargetTable) => string;
  onOpen: (table: TargetTable) => void;
  onDescribe: (table: TargetTable) => void;
}) {
  if (tables.length === 0) {
    return (
      <p className="animate-fade-in text-sm text-muted-foreground">
        {connection} has no tables to show.
      </p>
    );
  }
  // The API answers tables by schema, so each schema's are together.
  const schemas = new Map<string, TargetTable[]>();
  for (const t of tables) {
    const inSchema = schemas.get(t.schema);
    if (inSchema) inSchema.push(t);
    else schemas.set(t.schema, [t]);
  }
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
            {inSchema.map((t) => {
              const Icon = kindIcons[t.kind];
              const content = (
                <>
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  <Clipped text={t.name} className="min-w-0" />
                </>
              );
              const title = t.kind === "table" ? undefined : t.kind;
              const isCurrent = current?.schema === t.schema && current.name === t.name;
              return (
                <li key={t.name} className="group/table relative">
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
                    <CopyButton
                      value={sqlTableName(t)}
                      label={`Copy ${t.name}`}
                      className={rowButton}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
