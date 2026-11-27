import { useCallback, useEffect, useRef, useState } from "react";

/** A version of the explorer's SQL, kept in its {@link useSqlHistory}. */
export interface HistoryEntry {
  /** Tells entries apart, as their React key; the same SQL can be kept more than once. */
  id: number;
  sql: string;
  at: Date;
}

/** How long the SQL stays the same before it's kept, so typing keeps a version, not each key. */
export const SETTLE_MS = 1000;

// The most versions kept; older ones are dropped.
const MAX_ENTRIES = 100;

/**
 * Keeps the versions of `sql` as it's written, newest first, in memory only: a reload or leaving
 * the page forgets them. A version is kept once the SQL has stayed the same for
 * {@link SETTLE_MS}, and at once with `keep`, as before the page replaces the SQL itself or runs
 * it. Empty SQL isn't kept, and neither is a version the same as the newest.
 */
export function useSqlHistory(sql: string): {
  entries: readonly HistoryEntry[];
  keep: (sql: string) => void;
} {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const ids = useRef(0);

  const keep = useCallback((text: string) => {
    if (!text.trim()) return;
    ids.current += 1;
    const id = ids.current;
    setEntries((list) =>
      list[0]?.sql.trim() === text.trim()
        ? list
        : [{ id, sql: text, at: new Date() }, ...list].slice(0, MAX_ENTRIES),
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      keep(sql);
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [sql, keep]);

  return { entries, keep };
}
