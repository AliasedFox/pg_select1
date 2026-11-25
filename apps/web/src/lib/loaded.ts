import { useEffect, useState } from "react";

import { describeError } from "@/lib/api";

/** Where something a page asked the API for is: not asked for, on its way, there, or failed. */
export type Loaded<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; value: T }
  | { kind: "failed"; message: string };

/**
 * Loads what `load` answers, again whenever it's another function, and nothing while it's null.
 * What came back is kept with the function that asked, so an answer to an earlier choice never
 * shows for a later one: memoize `load` on what it depends on.
 */
export function useLoaded<T>(load: (() => Promise<T>) | null): Loaded<T> {
  const [result, setResult] = useState<{ load: () => Promise<T>; loaded: Loaded<T> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    load?.().then(
      (value) => {
        if (!cancelled) setResult({ load, loaded: { kind: "loaded", value } });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({ load, loaded: { kind: "failed", message: describeError(error) } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);
  if (!load) return { kind: "idle" };
  return result?.load === load ? result.loaded : { kind: "loading" };
}
