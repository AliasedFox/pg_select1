import type { TableRows } from "@pg_select1/shared";
import { ArrowLeftRightIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import { chartPoints, defaultAxes, isNumberColumn, MAX_CHART_ROWS } from "@/lib/chart";

// The longest label along the bottom, in characters, before it's cut short; the tooltip has it
// whole.
const MAX_TICK_LENGTH = 16;

const compact = new Intl.NumberFormat(undefined, { notation: "compact" });

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
 * Shows a result's rows as a bar chart, one bar for each of the first {@link MAX_CHART_ROWS}, with
 * a column along the bottom and another column, of numbers, up the side, picked from two selects
 * that never offer the column the other has, and swapped with a button between them when the
 * column along the bottom holds numbers too. It starts with the first column along the bottom
 * and the second up the side, or the first column of numbers after the first when the second
 * isn't one, and says so when there's none to chart.
 * `more` says there are rows past these that the grid reads as it scrolls, which the chart
 * doesn't. Bars don't grow in: the chart fades in with what it's in.
 */
export function ResultChart({ data, more = false }: { data: TableRows; more?: boolean }) {
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

  return (
    <figure aria-label="Result chart" className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <AxisSelect
            label="X axis"
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
                : `${columns[x]?.name ?? ""} isn't a column of numbers, for the Y axis`
            }
            disabled={!canSwap}
            onClick={() => {
              setAxes({ x: y, y: x });
            }}
          >
            <ArrowLeftRightIcon aria-hidden="true" />
          </Button>
          <AxisSelect
            label="Y axis"
            columns={yColumns}
            value={y}
            onChange={(index) => {
              setAxes({ x, y: index });
            }}
          />
        </div>
        {!shownAll && (
          <span className="text-xs text-muted-foreground">
            {more
              ? `Charts the first ${points.length.toLocaleString()} rows; the table reads more as it scrolls.`
              : `Charts the first ${points.length.toLocaleString()} of ${rows.length.toLocaleString()} rows.`}
          </span>
        )}
      </div>
      <ChartContainer config={config} className="aspect-auto h-80 w-full">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
            tickFormatter={(value: string) =>
              value.length > MAX_TICK_LENGTH ? `${value.slice(0, MAX_TICK_LENGTH - 1)}…` : value
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width="auto"
            tickFormatter={(value: number) => compact.format(value)}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="y" fill="var(--color-y)" radius={2} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </figure>
  );
}
