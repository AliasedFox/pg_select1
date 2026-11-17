import { useSyncExternalStore } from "react";

// A small router on the History API: the path is the state, and `navigate` and the browser's
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

/** Answers the current path, re-rendering when it changes. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath);
}

/** Goes to a path in the app without reloading the page. */
export function navigate(path: string): void {
  window.history.pushState(null, "", path);
  for (const listener of listeners) listener();
}
