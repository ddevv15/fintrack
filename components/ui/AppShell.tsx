import type { ReactNode } from "react";

import { AppNav, type NavItem } from "./AppNav";

/**
 * The frame every signed in screen sits in.
 *
 * One breakpoint, md (768px): a bottom tab bar below it, a left rail at and
 * above it. That single number is stated in spec 0003 so it is not re-decided
 * per component.
 *
 * These routes are provisional. Feature 5 owns authentication and the route
 * grouping that decides which layout wraps which page, so expect it to move
 * them; nothing here reads a session.
 */
// History sits next to Month because the two are the same thing at two
// distances: what you logged this month, and what you have logged ever.
const navItems: readonly NavItem[] = [
  { href: "/", label: "Log", icon: "log" },
  { href: "/transactions", label: "Month", icon: "transactions" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/breakdown", label: "Breakdown", icon: "breakdown" },
  { href: "/settings", label: "Profile", icon: "profile" },
];

export function AppShell({
  children,
  items = navItems,
}: {
  children: ReactNode;
  /** Overridden only by the gallery, so the active tab state is reachable. */
  items?: readonly NavItem[];
}) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* The nav comes first in the DOM so the desktop rail is read in the
          order it is seen. On a phone that would put every tab ahead of the
          content on every screen, which is what this link exists to skip. */}
      <a
        href="#main"
        className="focus-ring bg-surface text-fg sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded-sm focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <AppNav items={items} />

      <main
        id="main"
        // pb-20 clears the fixed tab bar; the bar is out of flow, so nothing
        // else reserves that space.
        className="flex-1 px-4 pt-6 pb-20 md:px-8 md:pb-8"
      >
        {children}
      </main>
    </div>
  );
}
