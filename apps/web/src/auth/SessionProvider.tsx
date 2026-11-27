import { type ReactNode, useCallback, useEffect, useState } from "react";

import { showTheme } from "@/lib/theme";

import { loadSession, type Session, SessionContext } from "./session";

// Shows the signed-in user's theme, which follows their account onto this device.
function showSessionTheme(session: Session) {
  if (session.kind === "signedIn") showTheme(session.user.theme);
}

/**
 * Finds out who's signed in, once, and shares it with the app below it through `useSession`.
 * Whoever it is, it shows the theme saved on their account.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadSession().then((loaded) => {
      if (cancelled) return;
      showSessionTheme(loaded);
      setSession(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const loaded = await loadSession();
    showSessionTheme(loaded);
    setSession(loaded);
  }, []);

  return <SessionContext value={{ session, refresh }}>{children}</SessionContext>;
}
