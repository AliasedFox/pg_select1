import { type CSSProperties, useEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// How long the pointer rests on text cut short before it's shown whole, and how much of it a
// tooltip shows at most, so a big `jsonb` doesn't fill the screen.
const TOOLTIP_DELAY_MS = 400;
const TOOLTIP_CHARS = 2000;

/**
 * Text in one line, cut short to fit where it is, and shown whole in a tooltip when it doesn't
 * fit or has more lines than the one it shows. Whether it fits is measured once the pointer has
 * rested on it, so text that fits never has a tooltip.
 *
 * It's one element until its tooltip opens: a grid mounts thousands of these as it scrolls, and
 * a Radix tooltip for each, open or not, was most of what rendering them cost, as is each element
 * the browser works out the styles of. So the text times the pointer's rest itself, and the
 * tooltip, while it's open, points at a box laid over the text, which stays the same element.
 */
export function Clipped({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Where the text is in its positioned ancestor, while the tooltip's open.
  const [box, setBox] = useState<CSSProperties | null>(null);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const close = () => {
    clearTimeout(timer.current);
    setBox(null);
  };
  return (
    <>
      <span
        ref={ref}
        className={cn("block truncate", className)}
        onPointerEnter={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const span = ref.current;
            if (span && (span.scrollWidth > span.clientWidth || text.includes("\n"))) {
              setBox({
                left: span.offsetLeft,
                top: span.offsetTop,
                width: span.offsetWidth,
                height: span.offsetHeight,
              });
            }
          }, TOOLTIP_DELAY_MS);
        }}
        onPointerLeave={close}
      >
        {text}
      </span>
      {box && (
        <Tooltip
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
        >
          {/* Beside the text, so it's placed from the same ancestor, and letting the pointer
              through to it. */}
          <TooltipTrigger asChild>
            <span aria-hidden="true" className="pointer-events-none absolute" style={box} />
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
      )}
    </>
  );
}
