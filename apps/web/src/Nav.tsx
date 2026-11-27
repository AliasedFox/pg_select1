import type { Me } from "@pg_select1/shared";
import { ChevronDownIcon, DatabaseIcon, type LucideIcon, UsersIcon } from "lucide-react";
import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navigate } from "@/router";

interface NavMenuItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

// The pages everyone sees.
const MAIN_PAGES = [
  { path: "/explore", label: "Explore" },
  { path: "/queries", label: "Queries" },
  { path: "/dashboards", label: "Dashboards" },
];

// Whether `to` is the current page, or the one the current page is in, as a dashboard is in
// Dashboards.
function isCurrent(path: string, to: string): boolean {
  return path === to || path.startsWith(`${to}/`);
}

// The pages only admins see.
const ADMIN_MENU: NavMenuItem[] = [
  {
    path: "/connections",
    label: "Connections",
    description: "The Postgres databases to explore",
    icon: DatabaseIcon,
  },
  {
    path: "/users",
    label: "Users",
    description: "Who can sign in, and as what",
    icon: UsersIcon,
  },
];

// The main navigation's items, with a yellow line under the current page that fades in, as the
// motion rules have current states do.
const navItemClass =
  "relative flex h-full items-center gap-1 px-1 text-sm font-medium text-muted-foreground transition-colors outline-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors hover:text-foreground focus-visible:text-foreground aria-[current=page]:text-foreground aria-[current=page]:after:bg-highlight data-[state=open]:text-foreground";

/**
 * The header's main navigation: the explorer, saved queries and dashboards for everyone, and the Admin menu
 * for admins.
 */
export function Nav({ path, user }: { path: string; user: Me }) {
  return (
    <nav aria-label="Main" className="flex h-full items-center gap-5">
      {MAIN_PAGES.map(({ path: to, label }) => (
        <a
          key={to}
          href={to}
          aria-current={isCurrent(path, to) ? "page" : undefined}
          className={navItemClass}
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            navigate(to);
          }}
        >
          {label}
        </a>
      ))}
      {user.role === "admin" && <NavMenu label="Admin" items={ADMIN_MENU} path={path} />}
    </nav>
  );
}

// A menu of pages, current when one of them is.
function NavMenu({ label, items, path }: { label: string; items: NavMenuItem[]; path: string }) {
  const menu = useHoverMenu();
  const current = items.some((item) => item.path === path);

  return (
    <DropdownMenu {...menu.root}>
      <DropdownMenuTrigger
        aria-current={current ? "page" : undefined}
        className={navItemClass}
        {...menu.hover}
        {...menu.trigger}
      >
        {label}
        <ChevronDownIcon aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" {...menu.content}>
        {items.map(({ path: to, label: itemLabel, description, icon: Icon }) => (
          <DropdownMenuItem key={to} asChild className="items-start gap-3 py-2">
            <a
              href={to}
              aria-current={path === to ? "page" : undefined}
              onClick={(event: MouseEvent) => {
                event.preventDefault();
                navigate(to);
              }}
            >
              <Icon aria-hidden="true" className="mt-0.5 text-muted-foreground" />
              <span className="flex flex-col">
                <span className="font-medium">{itemLabel}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// How long the pointer can be off the menu, e.g. crossing the gap under the trigger, before it closes.
const HOVER_CLOSE_DELAY = 150;

// A menu that a mouse opens by hovering over it; a click, a tap or the keyboard open it as any
// menu. Spread `root` on the DropdownMenu, `hover` on its trigger, `trigger` on it too and
// `content` on its DropdownMenuContent.
function useHoverMenu() {
  const [open, setOpen] = useState(false);
  // Whether the pointer opened it, so it closes when the pointer leaves without taking the focus.
  const hovered = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
    },
    [],
  );

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    if (!open) hovered.current = true;
    setOpen(true);
  };
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !hovered.current) return;
    closeTimer.current = setTimeout(() => {
      setOpen(false);
    }, HOVER_CLOSE_DELAY);
  };
  const onOpenChange = (next: boolean) => {
    clearTimeout(closeTimer.current);
    if (next) hovered.current = false;
    setOpen(next);
  };
  const hover = { onPointerEnter, onPointerLeave };

  return {
    root: { modal: false, open, onOpenChange },
    hover,
    trigger: {
      ref: trigger,
      // Hovering already opened it, so a click keeps it open rather than toggling it.
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === "mouse" && open) event.preventDefault();
      },
    },
    content: {
      ...hover,
      // Nor does that click count as one outside the menu, which closes it.
      onPointerDownOutside: (event: Event) => {
        if (event.target instanceof Node && trigger.current?.contains(event.target)) {
          event.preventDefault();
        }
      },
      // Leaving a menu the pointer opened shouldn't move the focus back to the trigger.
      onCloseAutoFocus: (event: Event) => {
        if (hovered.current) event.preventDefault();
      },
    },
  };
}
