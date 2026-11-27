import type { Me } from "@pg_select1/shared";
import {
  LogOutIcon,
  type LucideIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { useState } from "react";

import { signOut } from "@/auth/api";
import { useSession } from "@/auth/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { avatarGradient } from "@/lib/avatar";
import { isTheme, showTheme, storedTheme, type Theme } from "@/lib/theme";
import { navigate } from "@/router";

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

/**
 * The signed-in user's menu, opened from their initial, on a gradient of two hues picked from
 * their id (see {@link avatarGradient}), at the right of the header: who they are,
 * their profile, the theme and signing out. The theme shows as soon as it's picked and is kept on this device,
 * not on the account.
 */
export function AccountMenu({ user }: { user: Me }) {
  const { refresh } = useSession();
  const [theme, setTheme] = useState(storedTheme);
  const initial = (user.name || user.email).charAt(0).toUpperCase();

  async function onSignOut() {
    await signOut();
    navigate("/");
    await refresh();
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar>
          <AvatarFallback
            style={{ backgroundImage: avatarGradient(user.id) }}
            className="font-semibold text-black"
          >
            {initial}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            navigate("/profile");
          }}
        >
          <UserIcon aria-hidden="true" className="text-muted-foreground" /> Your profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-2 text-sm">
          <span id="account-menu-theme" className="flex items-center gap-2">
            <PaletteIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />{" "}
            Theme
          </span>
          <DropdownMenuRadioGroup
            aria-labelledby="account-menu-theme"
            value={theme}
            onValueChange={(value) => {
              if (!isTheme(value)) return;
              setTheme(value);
              showTheme(value);
            }}
            className="flex items-center rounded-full bg-muted p-0.5"
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuPrimitive.RadioItem
                key={value}
                value={value}
                aria-label={label}
                title={label}
                // Picking one keeps the menu open, to show it picked.
                onSelect={(event) => {
                  event.preventDefault();
                }}
                className="flex size-7 cursor-default items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[color,background-color,box-shadow] select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm"
              >
                <Icon aria-hidden="true" className="size-3.5" />
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void onSignOut()}>
          <LogOutIcon aria-hidden="true" className="text-muted-foreground" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
