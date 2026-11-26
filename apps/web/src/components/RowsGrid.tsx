import type { TableRows } from "@pg_select1/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
  FilterIcon,
  GroupIcon,
} from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  memo,
  type ReactNode,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopy } from "@/lib/clipboard";
import { columnFilters } from "@/lib/filters";
import { columnGroups } from "@/lib/groups";
import { sqlIdentifier } from "@/lib/sql";
import { cn } from "@/lib/utils";

// Every row is one line high, so the virtualizer knows where each is without measuring it.
const ROW_HEIGHT = 32;

// A column is as wide as its name, its type or its longest value among the first rows, within
// limits, in characters of the grid's monospaced font.
const SAMPLE_ROWS = 100;
// At least wide enough for its header's three buttons, filter, group and sort, beside its padding.
const MIN_WIDTH_CH = 10;
const MAX_WIDTH_CH = 40;
// Room for a cell's padding and border, in the same characters, with one to spare.
const PADDING_CH = 4;

// How close to the last row the window gets before the grid asks for more, in rows.
const LOAD_AHEAD = 50;

// How many rows are rendered past each edge of the window, so a scroll shows them at once.
const OVERSCAN = 10;

function columnWidths({ columns, rows }: TableRows): number[] {
  return columns.map((column, index) => {
    let longest = Math.max(column.name.length, column.type.length);
    for (const row of rows.slice(0, SAMPLE_ROWS)) {
      longest = Math.max(longest, row[index]?.length ?? 4);
    }
    return Math.min(MAX_WIDTH_CH, Math.max(MIN_WIDTH_CH, longest)) + PADDING_CH;
  });
}

// The grid's lines with no rows in them, drawn behind the rows: the browser scrolls the page
// before the rows for where it scrolls to are rendered, and a quick scroll past a few screens
// shows these for a moment rather than nothing. A line under each row, though not the last, whose
// bottom is the grid's own border, and one at the right of each column, where the cells' are.
function emptyGrid(widths: number[]): CSSProperties {
  let right = 0;
  const columns = widths.map((width) => {
    right += width;
    return `transparent 0 calc(${right}ch - 1px), var(--border) 0 ${right}ch`;
  });
  return {
    backgroundImage: `linear-gradient(to right, ${columns.join(", ")}, transparent 0), linear-gradient(to bottom, transparent calc(${ROW_HEIGHT}px - 1px), var(--border) 0)`,
    backgroundSize: `100% 100%, 100% ${ROW_HEIGHT}px`,
    backgroundRepeat: "no-repeat, repeat-y",
    // Scrolled sideways along with the rows, and short of the last row's line.
    backgroundAttachment: "local",
    backgroundClip: "content-box",
    paddingBottom: 1,
  };
}

// One value, or `NULL`, which stands out from text and has nothing to copy. Memoized, since the
// rows in the window render again as the page scrolls, and their values don't change. Its copy
// button is only rendered once the pointer first comes over it, fading in the first time: each
// row that scrolls into the window mounts a cell for every column, and a button for each was
// half of what scrolling cost.
const Cell = memo(function Cell({ value, line }: { value: string | null; line: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <td
      className={cn("group/cell relative min-w-0 border-r px-3 leading-8", line && "border-b")}
      onPointerEnter={
        hovered
          ? undefined
          : () => {
              setHovered(true);
            }
      }
    >
      {value === null ? (
        <span className="block text-muted-foreground/70">NULL</span>
      ) : (
        <>
          <Clipped text={value} />
          {hovered && (
            <CopyButton
              value={value}
              className="animate-fade-in group-hover/cell:opacity-100 group-hover/cell:transition-[color,opacity]"
            />
          )}
        </>
      )}
    </td>
  );
});

// A column header's button, which shows while the header's hovered or its menu's open, and stays
// in sight for a moment after it copies. Its place is the header's buttons', so the two sit side
// by side however wide "Copied" makes one.
const headButton = (copied: boolean) =>
  cn(
    hoverButton,
    "static translate-y-0 group-hover/head:opacity-100 group-hover/head:transition-[color,opacity] data-[state=open]:opacity-100",
    copied && "opacity-100",
  );

// What a header's button shows: its icon, or that it just copied.
function HeadButtonContent({ copied, icon }: { copied: boolean; icon: ReactNode }) {
  return copied ? (
    <>
      <CheckIcon className="size-3.5 text-success" />
      <span className="animate-fade-in">Copied</span>
    </>
  ) : (
    icon
  );
}

// What a header's menu says it copies.
const menuLabel = (text: string) => (
  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
    {text}
  </DropdownMenuLabel>
);
const copyLabel = menuLabel("Copy, to paste in the SQL");
const groupLabel = menuLabel("Copy a query that counts each group");

// Copies an `order by` on a column, ascending or descending, to paste into the SQL, and says so
// for a moment after. It doesn't sort the rows here: there may be more than the grid has.
function SortMenu({ column }: { column: string }) {
  const { copied, copy } = useCopy();
  const orderBy = (direction: "asc" | "desc") => `order by ${sqlIdentifier(column)} ${direction}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={copied ? "Copied" : `Sort by ${column}`}
        className={headButton(copied)}
      >
        <HeadButtonContent copied={copied} icon={<ArrowUpDownIcon className="size-3.5" />} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {copyLabel}
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

// Copies the SQL of one of a column's clauses, listed in groups by what they do, and says so for
// a moment after. `label` names the button until it copies, and `hint` says what's copied. Each
// shows its `clause` when the SQL it copies is more than that.
function ClauseMenu({
  label,
  icon,
  hint = copyLabel,
  clauses,
}: {
  label: string;
  icon: ReactNode;
  hint?: ReactNode;
  clauses: { name: string; sql: string; clause?: string }[][];
}) {
  const { copied, copy } = useCopy();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={copied ? "Copied" : label} className={headButton(copied)}>
        <HeadButtonContent copied={copied} icon={icon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hint}
        {clauses.map((group, index) => (
          // By position: a type's groups never change.
          <Fragment key={index}>
            {index > 0 && <DropdownMenuSeparator />}
            {group.map((clause) => (
              <DropdownMenuItem
                key={clause.name}
                className="text-xs"
                onSelect={() => {
                  copy(clause.sql);
                }}
              >
                <span className="w-28 shrink-0 text-muted-foreground">{clause.name}</span>
                <span className="font-mono">{clause.clause ?? clause.sql}</span>
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A column's header: its name and type, and the menus that copy a filter, a group or a sort on
// it. Memoized, since the grid renders again on every frame the page scrolls, and rendering its
// three menus for every column each time was most of what scrolling cost.
const ColumnHead = memo(function ColumnHead({
  name,
  type,
  sql,
}: {
  name: string;
  type: string;
  sql: string;
}) {
  return (
    <th
      scope="col"
      className="group/head relative min-w-0 border-r border-b px-3 py-1.5 text-left font-normal"
    >
      <Clipped text={name} className="font-medium text-foreground" />
      <Clipped text={type} className="text-muted-foreground" />
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-1">
        {/* Like sorting, neither filters nor groups the rows here. */}
        <ClauseMenu
          label={`Filter by ${name}`}
          icon={<FilterIcon className="size-3.5" />}
          clauses={columnFilters(name, type, sql)}
        />
        <ClauseMenu
          label={`Group by ${name}`}
          icon={<GroupIcon className="size-3.5" />}
          hint={groupLabel}
          clauses={columnGroups(name, type, sql)}
        />
        <SortMenu column={name} />
      </div>
    </th>
  );
});

/**
 * Shows a table's or a query's rows in a grid as long as they are, scrolled with the page, under
 * a header with each column's name and type that stays below the app's header. Only the rows in
 * the window are rendered, so thousands scroll as smoothly as ten, and `onNearEnd`, when given,
 * is called whenever the window comes near the last row, to load more. A grid wider than the
 * page scrolls sideways by itself, its header along with it. A value too long for its column is
 * cut short, whole in a tooltip on hover, and each one can be copied from a button that shows
 * on hover; `NULL` stands out from text. Each column's header copies an `order by` on it, a
 * `where` that fits its type, like `ilike` on text, which is an `and` when `sql`, the query in the
 * editor, has a `where` already, or a query that counts the rows of `sql` in each group of it,
 * like a timestamp's day.
 */
export function RowsGrid({
  data,
  label,
  sql = "",
  onNearEnd,
  className,
}: {
  data: TableRows;
  label: string;
  /** The query in the editor, which the columns' filters go in and their groups wrap. */
  sql?: string;
  onNearEnd?: () => void;
  className?: string;
}) {
  const headRef = useRef<HTMLTableSectionElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const barRef = useRef<HTMLTableSectionElement>(null);
  const widths = useMemo(() => columnWidths(data), [data]);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  // The columns, then what's left of the grid's width, if anything, past the last one. At least
  // as wide as the grid, so a table of few columns has its lines run across.
  const rowStyle: CSSProperties = {
    gridTemplateColumns: `${widths.map((width) => `${width}ch`).join(" ")} minmax(0, 1fr)`,
  };
  const width = `max(100%, ${totalWidth}ch)`;
  const background = useMemo(() => emptyGrid(widths), [widths]);

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
    overscan: OVERSCAN,
    scrollMargin,
  });

  const items = virtualizer.getVirtualItems();

  // Each time the window moves or rows come, whether it's near the last of them.
  const lastShown = items.at(-1)?.index ?? -1;
  useEffect(() => {
    if (onNearEnd && lastShown >= data.rows.length - LOAD_AHEAD) onNearEnd();
  }, [onNearEnd, lastShown, data.rows.length]);

  // The header, the rows and the scrollbar scroll sideways as one, whichever of them is scrolled.
  const follow = (from: HTMLElement | null) => {
    if (!from) return;
    for (const to of [headRef.current, bodyRef.current, barRef.current]) {
      if (to && to !== from && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
    }
  };

  // A table laid out as blocks and grids rather than as a table, so its header and its rows can
  // each scroll sideways while the page scrolls them down. No wider than its container, even as a
  // grid or flex item, so they scroll rather than it running past the container's edge.
  return (
    <table
      aria-label={label}
      aria-rowcount={data.rows.length + 1}
      className={cn("block min-w-0 rounded-lg border font-mono text-xs", className)}
    >
      <thead
        ref={headRef}
        onScroll={() => {
          follow(headRef.current);
        }}
        className="sticky top-14 z-10 block [scrollbar-width:none] overflow-x-auto rounded-t-lg bg-background"
      >
        <tr aria-rowindex={1} className="grid" style={{ ...rowStyle, width }}>
          {data.columns.map((column, index) => (
            // By position: a query's columns can share a name.
            <ColumnHead key={index} name={column.name} type={column.type} sql={sql} />
          ))}
          <th aria-hidden="true" className="border-b p-0" />
        </tr>
      </thead>
      <tbody
        ref={bodyRef}
        onScroll={() => {
          follow(bodyRef.current);
        }}
        className="relative block [scrollbar-width:none] overflow-x-auto"
        style={{ ...background, height: virtualizer.getTotalSize() }}
      >
        {items.map((item) => {
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
      {/* The grid's scrollbar, at the bottom of the window while the grid runs past it, rather
          than at the bottom of the rows, out of reach until the last of them. Styled, so it shows
          all the time even where scrollbars only show while scrolling, like a Mac with a
          trackpad, in Chrome and Safari. Nothing shows when the grid isn't wider than the page. */}
      <tfoot
        ref={barRef}
        aria-hidden="true"
        onScroll={() => {
          follow(barRef.current);
        }}
        className="sticky bottom-0 z-10 block overflow-x-auto rounded-b-lg bg-background [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/70"
      >
        {/* A pixel high, since a row of none wouldn't overflow. */}
        <tr className="block h-px" style={{ width }} />
      </tfoot>
    </table>
  );
}
