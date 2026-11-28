import { cn } from "cn";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * An outlined button with only an icon, named by `label`, which also shows as its tooltip. A
 * `destructive` one's icon is red, as for deleting.
 */
export function IconButton({
  label,
  icon,
  destructive = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
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
