import type { ExplorableConnection } from "@pg_select1/shared";
import type { MouseEvent } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { navigate } from "@/router";

/** A select of the databases someone can explore, by name, answering the name picked. */
export function DatabaseSelect({
  connections,
  value,
  onChange,
  className,
}: {
  connections: ExplorableConnection[];
  value: string | undefined;
  onChange: (name: string) => void;
  className?: string;
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger aria-label="Database" className={cn("w-full font-mono", className)}>
        <SelectValue placeholder="Choose a database" />
      </SelectTrigger>
      <SelectContent position="popper">
        {connections.map((c) => (
          <SelectItem key={c.id} value={c.name} className="font-mono">
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Says there are no databases to explore yet: where to add one for an admin, and who adds them
 * for anyone else.
 */
export function NoDatabases({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {isAdmin ? (
        <>
          No databases to explore yet.{" "}
          <a
            href="/connections"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={(event: MouseEvent) => {
              event.preventDefault();
              navigate("/connections");
            }}
          >
            Add a connection
          </a>{" "}
          first.
        </>
      ) : (
        "No databases to explore yet. Connections an admin makes visible will be here."
      )}
    </div>
  );
}
