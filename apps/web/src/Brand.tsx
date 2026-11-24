import type { MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { navigate } from "@/router";

/** pg_select1's name, as a link home, in the header and the footer. */
export function Brand({ className }: { className?: string }) {
  return (
    <a
      href="/"
      aria-label="pg_select1 home"
      className={cn(
        "rounded-md font-mono text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        navigate("/");
      }}
    >
      select<span className="text-slate">1</span>
    </a>
  );
}
