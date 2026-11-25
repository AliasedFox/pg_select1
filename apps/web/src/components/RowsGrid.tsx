import type { TableRows } from "@pg_select1/shared";
import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

// Every row is one line high, so the virtualizer knows where each is without measuring it.
const ROW_HEIGHT = 32;

// How high a grid that can't be measured is taken to be.
const UNMEASURED_HEIGHT = 800;

// A column is as wide as its name, its type or its longest value among the first rows, within
// limits, in characters of the grid's monospaced font.
const SAMPLE_ROWS = 100;
const MIN_WIDTH_CH = 6;
const MAX_WIDTH_CH = 40;
// Room for a cell's padding and border, in the same characters, with one to spare.
const PADDING_CH = 4;

function columnWidths({ columns, rows }: TableRows): number[] {
  return columns.map((column, index) => {
    let longest = Math.max(column.name.length, column.type.length);
    for (const row of rows.slice(0, SAMPLE_ROWS)) {
      longest = Math.max(longest, row[index]?.length ?? 4);
    }
    return Math.min(MAX_WIDTH_CH, Math.max(MIN_WIDTH_CH, longest)) + PADDING_CH;
  });
}

/**
 * Shows a table's or a query's rows in a grid that scrolls both ways under a header that stays
 * put, with each column's name and type. Only the rows in view are rendered, so a thousand scroll
 * as smoothly as ten. A value too long for its column is cut short, whole on hover; `NULL` stands
 * out from text. It's most of the screen high, less what `className` takes off.
 */
export function RowsGrid({
  data,
  label,
  className,
}: {
  data: TableRows;
  label: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const widths = useMemo(() => columnWidths(data), [data]);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);

  // oxlint-disable-next-line react/incompatible-library -- The grid passes nothing from the virtualizer to memoized components, so nothing goes stale.
  const virtualizer = useVirtualizer({
    count: data.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    // A grid without a size yet, hidden or in a DOM without layout as in tests, is taken to be a
    // screenful high rather than showing no rows.
    observeElementRect: (instance, onChange) =>
      observeElementRect(instance, (rect) => {
        onChange(rect.height > 0 ? rect : { width: rect.width, height: UNMEASURED_HEIGHT });
      }),
  });
  const items = virtualizer.getVirtualItems();
  const before = items[0]?.start ?? 0;
  const after = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  return (
    <div
      ref={scrollRef}
      className={cn("h-[calc(100svh-12rem)] min-h-80 overflow-auto rounded-lg border", className)}
    >
      <table
        aria-label={label}
        aria-rowcount={data.rows.length + 1}
        className="table-fixed border-separate border-spacing-0 font-mono text-xs"
        // At least as wide as the grid, so a table of few columns has its lines run across.
        style={{ width: `max(100%, ${totalWidth}ch)` }}
      >
        <colgroup>
          {widths.map((width, index) => (
            // By position: a query's columns can share a name.
            <col key={index} style={{ width: `${width}ch` }} />
          ))}
          {/* What's left of the grid's width, if anything, past the last column. */}
          <col />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background">
          <tr aria-rowindex={1}>
            {data.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className="border-r border-b px-3 py-1.5 text-left align-top font-normal"
              >
                <span className="block truncate font-medium text-foreground" title={column.name}>
                  {column.name}
                </span>
                <span className="block truncate text-muted-foreground" title={column.type}>
                  {column.type}
                </span>
              </th>
            ))}
            <th aria-hidden="true" className="border-b p-0" />
          </tr>
        </thead>
        <tbody>
          {before > 0 && (
            <tr aria-hidden="true">
              <td aria-hidden="true" colSpan={data.columns.length + 1} style={{ height: before }} />
            </tr>
          )}
          {items.map((item) => {
            const row = data.rows[item.index] ?? [];
            return (
              <tr
                key={item.key}
                aria-rowindex={item.index + 2}
                className="transition-colors hover:bg-muted/50"
              >
                {row.map((value, index) => (
                  <td
                    key={index}
                    className="truncate border-r border-b px-3"
                    style={{ height: ROW_HEIGHT }}
                    title={value ?? undefined}
                  >
                    {value ?? <span className="text-muted-foreground/70">NULL</span>}
                  </td>
                ))}
                <td aria-hidden="true" className="border-b p-0" />
              </tr>
            );
          })}
          {after > 0 && (
            <tr aria-hidden="true">
              <td aria-hidden="true" colSpan={data.columns.length + 1} style={{ height: after }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
