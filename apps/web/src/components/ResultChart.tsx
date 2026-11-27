import type { TableRows } from "@pg_select1/shared";
import {
  ArrowLeftRightIcon,
  ChartAreaIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartPieIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHART_KINDS,
  type ChartKind,
  type ChartPoint,
  chartPoints,
  defaultAxes,
  isNumberColumn,
  MAX_CHART_ROWS,
  type PieSlice,
  pieSlices,
} from "@/lib/chart";
import { cn } from "@/lib/utils";

// The longest label along the bottom, in characters, before it's cut short; the tooltip has it
// whole.
const MAX_TICK_LENGTH = 16;

const compact = new Intl.NumberFormat(undefined, { notation: "compact" });

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });

// Each kind of chart as the chart select names it, with its icon.
const KINDS: Record<ChartKind, { label: string; icon: LucideIcon }> = {
  bar: { label: "Bar", icon: ChartColumnIcon },
  line: { label: "Line", icon: ChartLineIcon },
  area: { label: "Area", icon: ChartAreaIcon },
  pie: { label: "Pie", icon: ChartPieIcon },
};

// The grey of slice `index` of `count`, from the primary color, the largest slice, fading
// evenly toward the background, since the theme has no other colors to tell them apart.
function sliceColor(index: number, count: number): string {
  const share = 100 - (index * 75) / Math.max(count - 1, 1);
  return `color-mix(in oklab, var(--primary) ${share.toFixed(0)}%, var(--background))`;
}

// Switches the kind of chart, with a button of each's icon, named on hover, like the explorer's
// Table / Chart toggle.
function KindToggle({
  value,
  onChange,
}: {
  value: ChartKind;
  onChange: (kind: ChartKind) => void;
}) {
  return (
    <fieldset aria-label="Chart" className="flex min-w-0 rounded-md border p-0.5">
      {CHART_KINDS.map((kind) => {
        const { label, icon: Icon } = KINDS[kind];
        return (
          <button
            key={kind}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={value === kind}
            onClick={() => {
              onChange(kind);
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-sm transition-colors [&_svg]:size-4",
              value === kind
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" />
          </button>
        );
      })}
    </fieldset>
  );
}

// A select of the columns a chart can have on one axis, by their positions, since a query's
// columns can share a name.
function AxisSelect({
  label,
  columns,
  value,
  onChange,
}: {
  label: string;
  columns: { name: string; index: number }[];
  value: number;
  onChange: (index: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Select
        value={String(value)}
        onValueChange={(index) => {
          onChange(Number(index));
        }}
      >
        <SelectTrigger id={id} size="sm" className="min-w-32 font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {columns.map((column) => (
            <SelectItem key={column.index} value={String(column.index)} className="font-mono">
              {column.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Shows a result's first {@link MAX_CHART_ROWS} rows as a chart of the `kind` picked from a toggle
 * after the axes: bars, a line, an area or a pie. It has a column along the bottom and another
 * column, of numbers, up the side, picked from two selects that never offer the column the other
 * has, and swapped with a button between them when the column along the bottom holds numbers
 * too. A pie has a slice for each row instead, named by the first select and sized by the
 * second, the largest of them, in greys, listed beside it (see {@link pieSlices}). It starts with
 * the first column along the bottom and the second up the side, or the first column of numbers
 * after the first when the second isn't one, and says so when there's none to chart.
 * `kind` is kept by the caller, so it stays picked for the next result. `more` says there are
 * rows past these that the grid reads as it scrolls, which the chart doesn't. Nothing grows in:
 * the chart fades in with what it's in.
 */
export function ResultChart({
  data,
  kind,
  onKindChange,
  more = false,
}: {
  data: TableRows;
  kind: ChartKind;
  onKindChange: (kind: ChartKind) => void;
  more?: boolean;
}) {
  const { columns, rows } = data;
  const [axes, setAxes] = useState(() => defaultAxes(columns));
  const { x, y } = axes;
  const yType = y === undefined ? "" : (columns[y]?.type ?? "");
  const points = useMemo(
    () => (y === undefined ? [] : chartPoints(rows, x, y, yType)),
    [rows, x, y, yType],
  );

  const all = columns.map((column, index) => ({
    name: column.name,
    index,
    number: isNumberColumn(column),
  }));
  // A column is never on both axes: each select leaves out the other's.
  const xColumns = all.filter((column) => column.index !== y);
  const yColumns = all.filter((column) => column.number && column.index !== x);

  if (y === undefined) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        There's no column of numbers to chart. Add one to the query, like{" "}
        <code className="font-mono text-foreground">count(*)</code>.
      </div>
    );
  }

  // Only a column of numbers can go up the side.
  const canSwap = all[x]?.number ?? false;
  const yName = columns[y]?.name ?? "";
  const config = { y: { label: yName, color: "var(--primary)" } } satisfies ChartConfig;
  const shownAll = rows.length <= MAX_CHART_ROWS && !more;
  const pie = kind === "pie";

  return (
    <figure aria-label="Result chart" className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <AxisSelect
            label={pie ? "Slices" : "X axis"}
            columns={xColumns}
            value={x}
            onChange={(index) => {
              setAxes({ x: index, y });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Swap axes"
            title={
              canSwap
                ? "Swap axes"
                : `${columns[x]?.name ?? ""} isn't a column of numbers, for the ${pie ? "values" : "Y axis"}`
            }
            disabled={!canSwap}
            onClick={() => {
              setAxes({ x: y, y: x });
            }}
          >
            <ArrowLeftRightIcon aria-hidden="true" />
          </Button>
          <AxisSelect
            label={pie ? "Values" : "Y axis"}
            columns={yColumns}
            value={y}
            onChange={(index) => {
              setAxes({ x, y: index });
            }}
          />
        </div>
        <KindToggle value={kind} onChange={onKindChange} />
        {!shownAll && (
          <span className="text-xs text-muted-foreground">
            {more
              ? `Charts the first ${points.length.toLocaleString()} rows; the table reads more as it scrolls.`
              : `Charts the first ${points.length.toLocaleString()} of ${rows.length.toLocaleString()} rows.`}
          </span>
        )}
      </div>
      {pie ? (
        <PieOf points={points} config={config} />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-80 w-full">
          {cartesian(kind, points)}
        </ChartContainer>
      )}
    </figure>
  );
}

// The bars, line or area of `points`, with the column along the bottom and the numbers up the
// side, in the primary color.
function cartesian(kind: Exclude<ChartKind, "pie">, points: ChartPoint[]): ReactNode {
  const axes = [
    <CartesianGrid key="grid" vertical={false} />,
    <XAxis
      key="x"
      dataKey="x"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={16}
      tickFormatter={(value: string) =>
        value.length > MAX_TICK_LENGTH ? `${value.slice(0, MAX_TICK_LENGTH - 1)}…` : value
      }
    />,
    <YAxis
      key="y"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      width="auto"
      tickFormatter={(value: number) => compact.format(value)}
    />,
    <ChartTooltip key="tooltip" cursor={false} content={<ChartTooltipContent />} />,
  ];
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };
  if (kind === "line") {
    return (
      <LineChart data={points} margin={margin}>
        {axes}
        <Line
          dataKey="y"
          type="monotone"
          stroke="var(--color-y)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    );
  }
  if (kind === "area") {
    return (
      <AreaChart data={points} margin={margin}>
        {axes}
        <Area
          dataKey="y"
          type="monotone"
          stroke="var(--color-y)"
          strokeWidth={2}
          fill="var(--color-y)"
          fillOpacity={0.15}
          isAnimationActive={false}
        />
      </AreaChart>
    );
  }
  return (
    <BarChart data={points} margin={margin}>
      {axes}
      <Bar dataKey="y" fill="var(--color-y)" radius={2} isAnimationActive={false} />
    </BarChart>
  );
}

// A pie of the slices of `points`, with each slice listed beside it, its size and its share of
// the whole, or a note when no row has a value more than 0 to slice.
function PieOf({ points, config }: { points: ChartPoint[]; config: ChartConfig }) {
  const slices = useMemo(() => pieSlices(points), [points]);
  if (slices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No row has a value more than 0 to slice.
      </p>
    );
  }
  const total = slices.reduce((sum, slice) => sum + slice.y, 0);
  const filled: (PieSlice & { fill: string })[] = slices.map((slice, index) => ({
    ...slice,
    fill: sliceColor(index, slices.length),
  }));
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <ChartContainer config={config} className="aspect-square h-80">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={filled}
            dataKey="y"
            nameKey="x"
            innerRadius="45%"
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </PieChart>
      </ChartContainer>
      <ul aria-label="Slices" className="grid min-w-0 gap-1.5 text-xs">
        {filled.map((slice, index) => (
          <li key={index} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: slice.fill }}
            />
            <span className="max-w-48 truncate font-mono" title={slice.x}>
              {slice.x}
            </span>
            <span className="ml-auto pl-4 font-mono text-foreground tabular-nums">
              {slice.y.toLocaleString()}
            </span>
            <span className="w-12 text-right text-muted-foreground tabular-nums">
              {percent.format(slice.y / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
