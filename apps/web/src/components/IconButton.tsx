import { cn } from "cn";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * An outlined button with only an icon, named by `label`, which also shows as its tooltip. A
 * `primary` one is filled, for a page's main action, and a `destructive` one's icon is red, as for
 * deleting. A `submit` one submits its form, so it needs no `onClick`.
 */
export function IconButton({
  label,
  icon,
  type = "button",
  primary = false,
  destructive = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  type?: "button" | "submit";
  primary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type={type}
          variant={primary ? "default" : "outline"}
          size="icon"
          aria-label={label}
          disabled={disabled}
          className={cn(
            "cursor-pointer",
            destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
