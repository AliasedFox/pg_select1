import type { Me } from "@pg_select1/shared";
import { type MouseEvent, type ReactNode, useEffect } from "react";

import { AccountMenu } from "@/auth/AccountMenu";
import { useSession } from "@/auth/session";
import { SessionProvider } from "@/auth/SessionProvider";
import { SetPasswordPage } from "@/auth/SetPasswordPage";
import { SignInPage } from "@/auth/SignInPage";
import { ConnectionsPage } from "@/connections/ConnectionsPage";
import { Nav } from "@/Nav";
import { navigate, redirect, usePath } from "@/router";
import { UsersPage } from "@/users/UsersPage";

/** The app: who's signed in, and the shell around the page for the current path. */
export function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const path = usePath();
  const { session } = useSession();
  const params = new URLSearchParams(window.location.search);
  // Who the header shows as signed in: nobody on the set-password page, which anyone can open.
  const user = session.kind === "signedIn" && path !== "/set-password" ? session.user : undefined;

  let page: ReactNode;
  if (path === "/set-password") {
    // Whoever has the link sets a password, signed in or not.
    page = <SetPasswordPage token={params.get("token")} />;
  } else if (session.kind === "loading") {
    page = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (session.kind === "failed") {
    page = (
      <p role="alert" className="animate-fade-in text-sm text-destructive">
        Couldn't reach the API: {session.message}
      </p>
    );
  } else if (session.kind === "signedOut") {
    const notice =
      params.get("password") === "set" ? "Your password is set. Sign in with it." : undefined;
    page = <SignInPage notice={notice} />;
  } else {
    page = <SignedInPage path={path} user={session.user} />;
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-x-6 px-4 sm:px-6">
          <a
            href="/"
            aria-label="pg_select1 home"
            className="rounded-md font-mono text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={(event: MouseEvent) => {
              event.preventDefault();
              navigate("/");
            }}
          >
            select<span className="text-slate">1</span>
          </a>
          {user && <Nav path={path} user={user} />}
          {user && (
            <div className="ml-auto flex">
              <AccountMenu user={user} />
            </div>
          )}
        </div>
      </header>
      {/* Keyed so each page fades in, rather than swapping in at once. */}
      <main
        key={path}
        className="mx-auto w-full max-w-screen-xl flex-1 animate-fade-in px-4 pt-6 pb-16 sm:px-6 sm:pt-10"
      >
        {page}
      </main>
    </div>
  );
}

// Swaps the address for another once rendered, keeping it out of the history.
function Redirect({ to }: { to: string }) {
  useEffect(() => {
    redirect(to);
  }, [to]);
  return null;
}

function SignedInPage({ path, user }: { path: string; user: Me }) {
  if (path === "/" || path === "/sign-in") {
    // Admins start at their connections; there's nothing else to open yet.
    if (user.role === "admin") return <Redirect to="/connections" />;
    return (
      <p className="text-sm text-muted-foreground">
        There's nothing to explore yet. Connections an admin makes visible will be here.
      </p>
    );
  }
  if (path === "/users") {
    if (user.role !== "admin") {
      return <p className="text-sm text-muted-foreground">Only admins can manage users.</p>;
    }
    return <UsersPage currentUserId={user.id} />;
  }
  if (path === "/connections") {
    if (user.role !== "admin") {
      return <p className="text-sm text-muted-foreground">Only admins can manage connections.</p>;
    }
    return <ConnectionsPage />;
  }
  return <p className="text-sm text-muted-foreground">There's no page here.</p>;
}
