import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/ui";

/**
 * A bordered panel.
 *
 * Separation comes from a border, never a shadow: spec 0003 defines no shadow
 * token, because a quiet near monochrome surface reads as layered from its edge
 * and picks up dirt from a drop shadow.
 */
export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "bg-surface border-border rounded-md border p-4",
        className,
      )}
      {...props}
    />
  );
}
