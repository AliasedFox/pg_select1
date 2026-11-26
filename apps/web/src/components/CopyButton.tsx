import { CheckIcon, CopyIcon } from "lucide-react";

import { useCopy } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * The look of a small button that sits over the right of what it's in and shows while that's
 * hovered or the button's focused, fading in, and goes at once. What it's in is `relative`, and
 * the button's `className` adds the `group-hover` that shows it, for that group's name.
 */
export const hoverButton =
  "absolute top-1/2 right-1 flex h-6 -translate-y-1/2 items-center gap-1 rounded-sm border bg-background px-1 font-sans text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100";

/**
 * A {@link hoverButton} that copies `value`, and says so for a moment after, staying in sight
 * while it does. `className` shows it on its group's hover.
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  /** What it's called before it's copied. */
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={() => {
        copy(value);
      }}
      className={cn(hoverButton, className, copied && "opacity-100")}
    >
      {copied ? (
        <>
          <CheckIcon className="size-3.5 text-success" />
          <span className="animate-fade-in">Copied</span>
        </>
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}
