import type { TableKind, TargetTable } from "@pg_select1/shared";
import { EyeIcon, LayersIcon, type LucideIcon, Table2Icon } from "lucide-react";
import type { MouseEvent } from "react";

const kindIcons: Record<TableKind, LucideIcon> = {
  table: Table2Icon,
  view: EyeIcon,
  "materialized view": LayersIcon,
  "partitioned table": Table2Icon,
  "foreign table": Table2Icon,
};

const itemClass =
  "relative flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-sm text-muted-foreground transition-colors outline-none before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent before:transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:text-foreground aria-[current=page]:before:bg-highlight";

/**
 * A connection's tables, under each schema's name, each with an icon for its kind. Picking one
 * calls `onPick`; with `href`, each is a link there too, so it can be opened in a new tab, and
 * otherwise a button. `current` is marked as the page shown.
 */
export function TableList({
  connection,
  tables,
  current,
  href,
  onPick,
}: {
  connection: string;
  tables: TargetTable[];
  current?: { schema: string; name: string };
  href?: (table: TargetTable) => string;
  onPick: (table: TargetTable) => void;
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

  return (
    <nav
      aria-label="Tables"
      className="grid max-h-[calc(100svh-12rem)] animate-fade-in content-start gap-3 overflow-y-auto"
    >
      {[...schemas].map(([schema, inSchema]) => (
        <div key={schema}>
          <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{schema}</h3>
          <ul>
            {inSchema.map((t) => {
              const Icon = kindIcons[t.kind];
              const content = (
                <>
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{t.name}</span>
                </>
              );
              const title = t.kind === "table" ? undefined : t.kind;
              const isCurrent = current?.schema === t.schema && current.name === t.name;
              return (
                <li key={t.name}>
                  {href ? (
                    <a
                      href={href(t)}
                      title={title}
                      aria-current={isCurrent ? "page" : undefined}
                      className={itemClass}
                      onClick={(event: MouseEvent) => {
                        event.preventDefault();
                        onPick(t);
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
                        onPick(t);
                      }}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
