import type { Me } from "@pg_select1/shared";
import { createContext, useContext } from "react";

import { describeError } from "@/lib/api";

import { fetchMe } from "./api";

/** Where the app is with knowing who's signed in. */
export type Session =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; user: Me }
  | { kind: "failed"; message: string };

/** What {@link useSession} answers. */
export interface SessionContextValue {
  session: Session;
  /** Asks the API again who's signed in, after signing in or out. */
  refresh: () => Promise<void>;
}

/** Shares the session down the tree; `SessionProvider` provides it. */
export const SessionContext = createContext<SessionContextValue | null>(null);

/** Asks the API who's signed in, as a {@link Session} that's never `loading`. */
export async function loadSession(): Promise<Session> {
  try {
    const user = await fetchMe();
    return user ? { kind: "signedIn", user } : { kind: "signedOut" };
  } catch (error) {
    return { kind: "failed", message: describeError(error) };
  }
}

/**
 * Answers who's signed in and a way to check again.
 *
 * @throws {Error} outside a `SessionProvider`.
 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession needs a SessionProvider above it");
  return value;
}
