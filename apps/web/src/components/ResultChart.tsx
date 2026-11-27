import type { ChartKind, TableRows } from "@pg_select1/shared";
import { type ReactNode, useMemo } from "react";
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

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CHART_KINDS,
  type ChartColumns,
  chartColumns,
  type ChartData,
  chartData,
  type PieSlice,
  pieSlices,
} from "@/lib/chart";
import { CHART_KIND_NAMES } from "@/lib/display";
import { cn } from "@/lib/utils";

// The longest label along the bottom, in characters, before it's cut short; the tooltip has it
// whole.
const MAX_TICK_LENGTH = 16;

const compact = new Intl.NumberFormat(undefined, { notation: "compact" });

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });

// The grey of series or slice `index` of `count`, from the primary color, the first, fading
// evenly toward the background, since the theme has no other colors to tell them apart.
function shade(index: number, count: number): string {
  const share = 100 - (index * 75) / Math.max(count - 1, 1);
  return `color-mix(in oklab, var(--primary) ${share.toFixed(0)}%, var(--background))`;
}

// Switches the kind of chart, with a button of each's icon, named on hover, like the explorer's
// Table / Chart toggle.
function KindToggle({
  value,
  onChange,
  className,
}: {
  value: ChartKind;
  onChange: (kind: ChartKind) => void;
  className?: string;
}) {
  return (
    <fieldset aria-label="Chart" className={cn("flex min-w-0 rounded-md border p-0.5", className)}>
      {CHART_KINDS.map((kind) => {
        const { label, icon: Icon } = CHART_KIND_NAMES[kind];
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

/**
 * Shows a result as a chart of `kind`: bars, a line, an area or a pie, with its columns read
 * from their order (see {@link chartColumns}). The first column is along the bottom, and the
 * columns of numbers after it up the side, a series each, unless a column of names comes after
 * the first, whose names then split the first column of numbers into series, stacked as bars
 * and areas; {@link chartData} has how many values and series it charts. A pie has a slice for
 * each value of the first column instead, sized by the first column of numbers, the largest of
 * them, in greys, listed beside it (see {@link pieSlices}). It says so when there's no column of
 * numbers after the first to chart.
 *
 * With `onKindChange`, as in the explorer, the kind is picked from a toggle at its top right,
 * and handed to `onKindChange`, so it stays for the next result and can be saved. Without it, as
 * on a dashboard, it's only the chart. `more` says there are rows past these that the grid reads
 * as it scrolls, which the chart doesn't. Nothing grows in: the chart fades in with what it's in.
 */
export function ResultChart({
  data,
  kind,
  onKindChange,
  more = false,
}: {
  data: TableRows;
  kind: ChartKind;
  onKindChange?: (kind: ChartKind) => void;
  more?: boolean;
}) {
  const { columns, rows } = data;
  const chart = useMemo(() => chartColumns(columns), [columns]);
  const pie = kind === "pie";
  const drawn = useMemo(
    () => (chart === undefined || pie ? undefined : chartData({ columns, rows }, chart)),
    [chart, pie, columns, rows],
  );

  if (chart === undefined) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        There's no column of numbers after the first to chart. Add one to the query, like{" "}
        <code className="font-mono text-foreground">count(*)</code>.
      </div>
    );
  }

  // A pie adds up every row; the rest chart those of their first values along the bottom.
  const used = drawn?.rows ?? rows.length;
  const shownAll = used === rows.length && !more;

  return (
    <figure aria-label="Result chart" className="grid gap-3 rounded-lg border p-4">
      {(onKindChange !== undefined || !shownAll) && (
        <div className="flex flex-wrap items-center gap-4">
          {!shownAll && (
            <span className="text-xs text-muted-foreground">
              {more
                ? `Charts the first ${used.toLocaleString()} rows; the table reads more as it scrolls.`
                : `Charts the first ${used.toLocaleString()} of ${rows.length.toLocaleString()} rows.`}
            </span>
          )}
          {onKindChange && <KindToggle value={kind} onChange={onKindChange} className="ml-auto" />}
        </div>
      )}
      {kind === "pie" || drawn === undefined ? (
        <PieOf data={data} chart={chart} />
      ) : (
        <Cartesian kind={kind} data={drawn} />
      )}
    </figure>
  );
}

// The bars, line or area of `data`, with the first column along the bottom and a series of
// numbers up the side for each of its series, in greys from the primary color, named in a
// legend when there's more than one.
function Cartesian({ kind, data }: { kind: Exclude<ChartKind, "pie">; data: ChartData }) {
  const { points, series, stacked } = data;
  const config = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.name, color: shade(i, series.length) }]),
  ) satisfies ChartConfig;
  const stackId = stacked ? "stack" : undefined;
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
    series.length > 1 && <ChartLegend key="legend" content={<ChartLegendContent />} />,
  ];
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };

  let drawn: ReactNode;
  if (kind === "line") {
    drawn = (
      <LineChart data={points} margin={margin}>
        {axes}
        {series.map(({ key }) => (
          <Line
            key={key}
            dataKey={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  } else if (kind === "area") {
    drawn = (
      <AreaChart data={points} margin={margin}>
        {axes}
        {series.map(({ key }) => (
          <Area
            key={key}
            dataKey={key}
            type="monotone"
            stackId={stackId}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            fill={`var(--color-${key})`}
            // One area is a tint under its line; stacked, each is told apart by its grey.
            fillOpacity={series.length > 1 ? 0.6 : 0.15}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );
  } else {
    drawn = (
      <BarChart data={points} margin={margin}>
        {axes}
        {series.map(({ key }) => (
          <Bar
            key={key}
            dataKey={key}
            stackId={stackId}
            fill={`var(--color-${key})`}
            // Rounded corners would notch a stack between its parts.
            radius={stacked ? 0 : 2}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    );
  }
  return (
    <ChartContainer config={config} className="aspect-auto h-80 w-full">
      {drawn}
    </ChartContainer>
  );
}

// A pie of the slices of `data`, with each slice listed beside it, its size and its share of
// the whole, or a note when no row has a value more than 0 to slice.
function PieOf({ data, chart }: { data: TableRows; chart: ChartColumns }) {
  const slices = useMemo(() => pieSlices(data, chart), [data, chart]);
  if (slices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No row has a value more than 0 to slice.
      </p>
    );
  }
  const name = data.columns[chart.values[0]]?.name ?? "";
  const config = { y: { label: name, color: "var(--primary)" } } satisfies ChartConfig;
  const total = slices.reduce((sum, slice) => sum + slice.y, 0);
  const filled: (PieSlice & { fill: string })[] = slices.map((slice, index) => ({
    ...slice,
    fill: shade(index, slices.length),
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
