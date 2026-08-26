"use client";

import { ChartPie, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/ui";

/**
 * The three tabs.
 *
 * This is the only "use client" file in components/ui/, and the only reason is
 * usePathname: marking the active tab needs the current route, and nothing on
 * the server knows it during a static render. Adding a second client component
 * to this directory needs a reason written in the file (spec 0003).
 *
 * Icons are named by a string rather than passed in as components, because a
 * Server Component cannot hand a function across the boundary to a client one.
 * The map is exhaustive, so a new tab name is a type error, not a blank icon.
 */
const icons = {
  log: Plus,
  transactions: Receipt,
  breakdown: ChartPie,
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
  /**
   * Set false for a tab whose route this render cannot actually reach.
   * next/link prefetches every visible link, so a tab pointing somewhere that
   * answers with a 404 or a redirect logs one on every page load, which buries
   * the console errors that actually matter.
   *
   * Every real app tab is now built, so the only caller that still needs this
   * is the component gallery, which renders the nav signed out and would
   * otherwise prefetch three routes that all bounce to sign in.
   */
  prefetch?: boolean;
};

export function AppNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        // Phone: a fixed bar in thumb reach, held clear of the home indicator.
        "border-border bg-surface fixed inset-x-0 bottom-0 z-10 border-t pb-[env(safe-area-inset-bottom)]",
        // Desktop: a rail down the left, in normal flow.
        "md:static md:h-auto md:w-56 md:shrink-0 md:border-t-0 md:border-r md:pb-0",
      )}
    >
      <ul className="flex md:flex-col md:gap-1 md:p-3">
        {items.map((item) => {
          const Icon = icons[item.icon];
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                prefetch={item.prefetch}
                // The active tab is named as current, not just coloured, so it
                // is announced rather than only seen.
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-11 flex-col items-center justify-center gap-1 rounded-sm px-2 py-2 text-xs",
                  "transition-colors duration-(--duration-fast) ease-(--ease-out-fast)",
                  "md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm",
                  active
                    ? "text-fg md:bg-bg font-medium"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
