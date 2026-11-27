import { useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { HistoryEntry } from "./history";

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

/**
 * Lists the versions of the explorer's SQL kept since the page opened, newest first, each with
 * when it was kept, and hands the one picked to `onRestore`. The one the editor holds now is
 * marked as current and can't be picked. Once one is, focus goes where `focusAfterRestore` puts
 * it rather than back to what opened the dialog.
 */
export function HistoryDialog({
  entries,
  current,
  onRestore,
  focusAfterRestore,
  onOpenChange,
}: {
  entries: readonly HistoryEntry[];
  /** The SQL in the editor now. */
  current: string;
  onRestore: (entry: HistoryEntry) => void;
  focusAfterRestore: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const restored = useRef(false);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        // Called once the dialog's gone, when focusing anything sooner would be undone.
        onCloseAutoFocus={(event) => {
          if (!restored.current) return;
          event.preventDefault();
          focusAfterRestore();
        }}
      >
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            The SQL as it was while you wrote it, newest first. It's kept until you reload or leave
            the page.
          </DialogDescription>
        </DialogHeader>
        <ol aria-label="Versions" className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {entries.map((entry) => {
            const isCurrent = entry.sql.trim() === current.trim();
            return (
              <li key={entry.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <time dateTime={entry.at.toISOString()} className="text-xs text-muted-foreground">
                    {when.format(entry.at)}
                  </time>
                  {isCurrent && <Badge variant="secondary">current</Badge>}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={isCurrent}
                    aria-label={`Restore the version from ${when.format(entry.at)}`}
                    onClick={() => {
                      restored.current = true;
                      onRestore(entry);
                    }}
                  >
                    Restore
                  </Button>
                </div>
                <pre className="line-clamp-6 font-mono text-xs break-all whitespace-pre-wrap">
                  {entry.sql}
                </pre>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
