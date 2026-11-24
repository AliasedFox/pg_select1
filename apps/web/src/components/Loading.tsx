import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A spinner while something loads, centred in half the screen's height, so what comes in its
 * place doesn't push the footer far down as it arrives. Pass `min-h-svh` to take the whole screen.
 */
export function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("grid min-h-[50vh] animate-fade-in place-items-center", className)}>
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
