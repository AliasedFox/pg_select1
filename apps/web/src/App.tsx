import type { Me } from "@pg_select1/shared";
import { type MouseEvent, type ReactNode, useEffect } from "react";

import { signOut } from "@/auth/api";
import { useSession } from "@/auth/session";
import { SessionProvider } from "@/auth/SessionProvider";
import { SetPasswordPage } from "@/auth/SetPasswordPage";
import { SignInPage } from "@/auth/SignInPage";
import { Button } from "@/components/ui/button";
import { ConnectionsPage } from "@/connections/ConnectionsPage";
import { cn } from "@/lib/utils";
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
      <header className="flex h-14 items-center gap-6 border-b px-6">
        <span className="font-mono text-lg font-semibold tracking-tight">
          select<span className="text-slate">1</span>
        </span>
        {session.kind === "signedIn" && path !== "/set-password" && (
          <Nav path={path} user={session.user} />
        )}
      </header>
      {/* Keyed so each page fades in, rather than swapping in at once. */}
      <main key={path} className="flex flex-1 animate-fade-in items-start justify-center p-6">
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

function Nav({ path, user }: { path: string; user: Me }) {
  const { refresh } = useSession();
  const links =
    user.role === "admin"
      ? [
          { href: "/connections", label: "Connections" },
          { href: "/users", label: "Users" },
        ]
      : [];

  async function onSignOut() {
    await signOut();
    navigate("/");
    await refresh();
  }

  return (
    <>
      <nav className="flex gap-1 text-sm">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={path === link.href ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1 transition-colors",
              path === link.href
                ? "bg-highlight text-highlight-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={(event: MouseEvent) => {
              event.preventDefault();
              navigate(link.href);
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {user.name} <span className="capitalize">· {user.role}</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => void onSignOut()}>
          Sign out
        </Button>
      </div>
    </>
  );
}
