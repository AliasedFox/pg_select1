import { useMemo, useSyncExternalStore } from "react";

// A small router on the History API: the path and its query are the state, and `navigate` and the browser's
// back and forward buttons are the only ways it changes.

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function getPath(): string {
  return window.location.pathname;
}

function getSearch(): string {
  return window.location.search;
}

/** Answers the current path, re-rendering when it changes. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath);
}

/**
 * Answers the current query's parameters, re-rendering when they change, as when a page keeps
 * what's chosen on it in its address.
 */
export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, getSearch);
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Goes to a path in place of the current one, without adding to the history: back skips it. */
export function redirect(path: string): void {
  window.history.replaceState(null, "", path);
  for (const listener of listeners) listener();
}

/** Goes to a path in the app without reloading the page. Going to the page already open does nothing. */
export function navigate(path: string): void {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", path);
  for (const listener of listeners) listener();
}
