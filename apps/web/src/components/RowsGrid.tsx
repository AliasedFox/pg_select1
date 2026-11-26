import type { TableRows } from "@pg_select1/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CheckIcon } from "lucide-react";
import {
  type CSSProperties,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Clipped } from "@/components/Clipped";
import { CopyButton, hoverButton } from "@/components/CopyButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopy } from "@/lib/clipboard";
import { sqlIdentifier } from "@/lib/sql";
import { cn } from "@/lib/utils";

// Every row is one line high, so the virtualizer knows where each is without measuring it.
const ROW_HEIGHT = 32;

// A column is as wide as its name, its type or its longest value among the first rows, within
// limits, in characters of the grid's monospaced font.
const SAMPLE_ROWS = 100;
const MIN_WIDTH_CH = 6;
const MAX_WIDTH_CH = 40;
// Room for a cell's padding and border, in the same characters, with one to spare.
const PADDING_CH = 4;

// How close to the last row the window gets before the grid asks for more, in rows.
const LOAD_AHEAD = 50;

function columnWidths({ columns, rows }: TableRows): number[] {
  return columns.map((column, index) => {
    let longest = Math.max(column.name.length, column.type.length);
    for (const row of rows.slice(0, SAMPLE_ROWS)) {
      longest = Math.max(longest, row[index]?.length ?? 4);
    }
    return Math.min(MAX_WIDTH_CH, Math.max(MIN_WIDTH_CH, longest)) + PADDING_CH;
  });
}

// One value, or `NULL`, which stands out from text and has nothing to copy. Memoized, since the
// rows in the window render again as the page scrolls, and their values don't change.
const Cell = memo(function Cell({ value, line }: { value: string | null; line: boolean }) {
  return (
    <td className={cn("group/cell relative min-w-0 border-r px-3 leading-8", line && "border-b")}>
      {value === null ? (
        <span className="block text-muted-foreground/70">NULL</span>
      ) : (
        <>
          <Clipped text={value} />
          <CopyButton
            value={value}
            className="group-hover/cell:opacity-100 group-hover/cell:transition-[color,opacity]"
          />
        </>
      )}
    </td>
  );
});

// Copies an `order by` on a column, ascending or descending, to paste into the SQL, and says so
// for a moment after. It doesn't sort the rows here: there may be more than the grid has.
function SortMenu({ column }: { column: string }) {
  const { copied, copy } = useCopy();
  const orderBy = (direction: "asc" | "desc") => `order by ${sqlIdentifier(column)} ${direction}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={copied ? "Copied" : `Sort by ${column}`}
        className={cn(
          hoverButton,
          "group-hover/head:opacity-100 group-hover/head:transition-[color,opacity] data-[state=open]:opacity-100",
          copied && "opacity-100",
        )}
      >
        {copied ? (
          <>
            <CheckIcon className="size-3.5 text-success" />
            <span className="animate-fade-in">Copied</span>
          </>
        ) : (
          <ArrowUpDownIcon className="size-3.5" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Copy, to paste in the SQL
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="font-mono text-xs"
          onSelect={() => {
            copy(orderBy("asc"));
          }}
        >
          <ArrowUpIcon />
          {orderBy("asc")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="font-mono text-xs"
          onSelect={() => {
            copy(orderBy("desc"));
          }}
        >
          <ArrowDownIcon />
          {orderBy("desc")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Shows a table's or a query's rows in a grid as long as they are, scrolled with the page, under
 * a header with each column's name and type that stays below the app's header. Only the rows in
 * the window are rendered, so thousands scroll as smoothly as ten, and `onNearEnd`, when given,
 * is called whenever the window comes near the last row, to load more. A grid wider than the
 * page scrolls sideways by itself, its header along with it. A value too long for its column is
 * cut short, whole in a tooltip on hover, and each one can be copied from a button that shows
 * on hover; `NULL` stands out from text. Each column's header copies an `order by` on it.
 */
export function RowsGrid({
  data,
  label,
  onNearEnd,
  className,
}: {
  data: TableRows;
  label: string;
  onNearEnd?: () => void;
  className?: string;
}) {
  const headRef = useRef<HTMLTableSectionElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const widths = useMemo(() => columnWidths(data), [data]);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  // The columns, then what's left of the grid's width, if anything, past the last one. At least
  // as wide as the grid, so a table of few columns has its lines run across.
  const rowStyle: CSSProperties = {
    gridTemplateColumns: `${widths.map((width) => `${width}ch`).join(" ")} minmax(0, 1fr)`,
  };
  const width = `max(100%, ${totalWidth}ch)`;

  // How far down the page the rows start, which the virtualizer counts the window's scroll from.
  // Measured again whenever the page changes size, since what's above, like the SQL box, can grow.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const measure = () => {
      setScrollMargin(body.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      observer.disconnect();
    };
  }, []);

  // oxlint-disable-next-line react/incompatible-library -- The grid passes nothing from the virtualizer to memoized components, so nothing goes stale.
  const virtualizer = useWindowVirtualizer({
    count: data.rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  // Each time the window moves or rows come, whether it's near the last of them.
  const lastShown = virtualizer.getVirtualItems().at(-1)?.index ?? -1;
  useEffect(() => {
    if (onNearEnd && lastShown >= data.rows.length - LOAD_AHEAD) onNearEnd();
  }, [onNearEnd, lastShown, data.rows.length]);

  // The header and the rows scroll sideways as one, whichever of them is scrolled.
  const follow = (from: HTMLElement | null, to: HTMLElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  // A table laid out as blocks and grids rather than as a table, so its header and its rows can
  // each scroll sideways while the page scrolls them down.
  return (
    <table
      aria-label={label}
      aria-rowcount={data.rows.length + 1}
      className={cn("block rounded-lg border font-mono text-xs", className)}
    >
      <thead
        ref={headRef}
        onScroll={() => {
          follow(headRef.current, bodyRef.current);
        }}
        className="sticky top-14 z-10 block [scrollbar-width:none] overflow-x-auto rounded-t-lg bg-background"
      >
        <tr aria-rowindex={1} className="grid" style={{ ...rowStyle, width }}>
          {data.columns.map((column, index) => (
            <th
              // By position: a query's columns can share a name.
              key={index}
              scope="col"
              className="group/head relative min-w-0 border-r border-b px-3 py-1.5 text-left font-normal"
            >
              <Clipped text={column.name} className="font-medium text-foreground" />
              <Clipped text={column.type} className="text-muted-foreground" />
              <SortMenu column={column.name} />
            </th>
          ))}
          <th aria-hidden="true" className="border-b p-0" />
        </tr>
      </thead>
      <tbody
        ref={bodyRef}
        onScroll={() => {
          follow(bodyRef.current, headRef.current);
        }}
        className="relative block overflow-x-auto"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = data.rows[item.index] ?? [];
          // The last row's bottom is the grid's own border.
          const line = item.index < data.rows.length - 1;
          return (
            <tr
              key={item.key}
              aria-rowindex={item.index + 2}
              className="absolute top-0 left-0 grid transition-colors hover:bg-muted/50"
              style={{
                ...rowStyle,
                width,
                height: ROW_HEIGHT,
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              {row.map((value, index) => (
                <Cell key={index} value={value} line={line} />
              ))}
              <td aria-hidden="true" className={cn("p-0", line && "border-b")} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
