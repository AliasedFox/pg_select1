import { type ReactNode, useCallback, useEffect, useState } from "react";

import { loadSession, type Session, SessionContext } from "./session";

/** Finds out who's signed in, once, and shares it with the app below it through `useSession`. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadSession().then((loaded) => {
      if (!cancelled) setSession(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setSession(await loadSession());
  }, []);

  return <SessionContext value={{ session, refresh }}>{children}</SessionContext>;
}
