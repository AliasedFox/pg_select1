import type { ChartKind, QueryDisplay } from "@pg_select1/shared";
import {
  ChartAreaIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartPieIcon,
  HashIcon,
  type LucideIcon,
  TableIcon,
} from "lucide-react";

/** A way of showing a result as it's named, with its icon. */
export interface DisplayName {
  label: string;
  icon: LucideIcon;
}

/** Each kind of chart as the chart's toggle names it, with its icon. */
export const CHART_KIND_NAMES: Record<ChartKind, DisplayName> = {
  bar: { label: "Bar", icon: ChartColumnIcon },
  line: { label: "Line", icon: ChartLineIcon },
  area: { label: "Area", icon: ChartAreaIcon },
  pie: { label: "Pie", icon: ChartPieIcon },
};

/** Names how a saved query's result is shown, as a table, a number or a chart of its kind, with its icon. */
export function displayName(display: QueryDisplay): DisplayName {
  if (display.type === "table") return { label: "Table", icon: TableIcon };
  if (display.type === "number") return { label: "Number", icon: HashIcon };
  const kind = CHART_KIND_NAMES[display.kind];
  return { label: `${kind.label} chart`, icon: kind.icon };
}
