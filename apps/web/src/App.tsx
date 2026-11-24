import type { Me } from "@pg_select1/shared";
import { type ReactNode, useEffect } from "react";

import { AccountMenu } from "@/auth/AccountMenu";
import { ProfilePage } from "@/auth/ProfilePage";
import { useSession } from "@/auth/session";
import { SessionProvider } from "@/auth/SessionProvider";
import { SetPasswordPage } from "@/auth/SetPasswordPage";
import { SignInPage } from "@/auth/SignInPage";
import { Brand } from "@/Brand";
import { Loading } from "@/components/Loading";
import { ConnectionsPage } from "@/connections/ConnectionsPage";
import { ExplorePage } from "@/explore/ExplorePage";
import { Footer } from "@/Footer";
import { cn } from "@/lib/utils";
import { Nav } from "@/Nav";
import { redirect, usePath } from "@/router";
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
    // Only a spinner until it's known who's signed in, rather than a header and footer that then
    // change around the page.
    return <Loading className="min-h-svh" />;
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
          <Brand />
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
        className={cn(
          "mx-auto w-full flex-1 animate-fade-in px-4 pt-6 pb-16 sm:px-6 sm:pt-10",
          // The explorer's tables use the whole width; other pages keep to the header's.
          path !== "/explore" && "max-w-screen-xl",
        )}
      >
        {page}
      </main>
      <Footer user={user} />
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
  // Everyone starts at the explorer.
  if (path === "/" || path === "/sign-in") return <Redirect to="/explore" />;
  if (path === "/explore") return <ExplorePage isAdmin={user.role === "admin"} />;
  if (path === "/profile") return <ProfilePage user={user} />;
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
