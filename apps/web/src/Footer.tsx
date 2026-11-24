import type { Me } from "@pg_select1/shared";
import type { MouseEvent, ReactNode } from "react";

import { Brand } from "@/Brand";
import { cn } from "@/lib/utils";
import { navigate } from "@/router";

const REPO_URL = "https://github.com/AliasedFox/pg_select1";
const ALIASEDFOX_URL = "https://aliasedfox.com";

// The pages only admins see, as in the header's Admin menu.
const ADMIN_LINKS = [
  { path: "/connections", label: "Connections" },
  { path: "/users", label: "Users" },
];

// The signed-in user's own pages, as in the header's account menu.
const ACCOUNT_LINKS = [{ path: "/profile", label: "Your profile" }];

// Where pg_select1 itself lives, outside the app.
const PROJECT_LINKS = [
  { href: REPO_URL, label: "Source on GitHub" },
  { href: `${REPO_URL}/issues`, label: "Report an issue" },
  { href: `${REPO_URL}/blob/main/LICENSE`, label: "Apache 2.0 license" },
];

// The footer's copyright year, as of when the app loaded.
const YEAR = new Date().getFullYear();

const footerLinkClass =
  "inline-flex items-center gap-1.5 rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The footer under every page: links to the pages the signed-in user can open, their profile among
 * them, to pg_select1's repository, and who makes it. Nobody signed in sees only the repository's links.
 */
export function Footer({ user }: { user?: Me }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-screen-xl flex-col gap-10 px-4 py-10 text-sm text-muted-foreground sm:px-6">
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6"
        >
          {user?.role === "admin" && (
            <FooterColumn title="Admin">
              {ADMIN_LINKS.map(({ path, label }) => (
                <PageLink key={path} path={path} label={label} />
              ))}
            </FooterColumn>
          )}
          {user && (
            <FooterColumn title="Account">
              {ACCOUNT_LINKS.map(({ path, label }) => (
                <PageLink key={path} path={path} label={label} />
              ))}
            </FooterColumn>
          )}
          <FooterColumn title="Project">
            {PROJECT_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={footerLinkClass}
              >
                {label}
              </a>
            ))}
          </FooterColumn>
        </nav>
        <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Brand className="text-base" />
            <a
              href={ALIASEDFOX_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(footerLinkClass, "text-xs")}
            >
              An AliasedFox{" "}
              <img
                src="/aliasedfox.svg"
                alt=""
                className="h-[18px] w-auto [image-rendering:pixelated]"
              />{" "}
              product
            </a>
          </div>
          <p className="text-xs">
            © {YEAR} AliasedFox · Not affiliated with or endorsed by the PostgreSQL Global
            Development Group.
          </p>
        </div>
      </div>
    </footer>
  );
}

// A link to a page of the app, opened without reloading.
function PageLink({ path, label }: { path: string; label: string }) {
  return (
    <a
      href={path}
      className={footerLinkClass}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        navigate(path);
      }}
    >
      {label}
    </a>
  );
}

// One titled list of links.
function FooterColumn({ title, children }: { title: string; children: ReactNode[] }) {
  return (
    <div className="grid content-start gap-3">
      <p className="font-medium text-foreground">{title}</p>
      <ul className="grid gap-2">
        {children.map((link, i) => (
          <li key={i}>{link}</li>
        ))}
      </ul>
    </div>
  );
}
