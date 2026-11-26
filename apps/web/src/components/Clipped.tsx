import { useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// How long the pointer rests on text cut short before it's shown whole, and how much of it a
// tooltip shows at most, so a big `jsonb` doesn't fill the screen.
const TOOLTIP_DELAY_MS = 400;
const TOOLTIP_CHARS = 2000;

/**
 * Text in one line, cut short to fit where it is, and shown whole in a tooltip when it doesn't
 * fit or has more lines than the one it shows. Whether it fits is measured as the pointer comes
 * to rest on it, so text that fits never has a tooltip.
 */
export function Clipped({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      delayDuration={TOOLTIP_DELAY_MS}
      open={open}
      onOpenChange={(next) => {
        const span = ref.current;
        setOpen(
          next && span !== null && (span.scrollWidth > span.clientWidth || text.includes("\n")),
        );
      }}
    >
      <TooltipTrigger asChild>
        <span ref={ref} className={cn("block truncate", className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="max-h-64 max-w-md overflow-hidden font-mono text-wrap break-all whitespace-pre-wrap"
      >
        {text.length > TOOLTIP_CHARS ? `${text.slice(0, TOOLTIP_CHARS)}…` : text}
      </TooltipContent>
    </Tooltip>
  );
}
