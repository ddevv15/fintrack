import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

/**
 * Nothing here, on purpose.
 *
 * This has to read as deliberate. An empty month and a month that failed to
 * load look identical if both render as blank space, and only one of them means
 * you have not spent anything.
 */
type EmptyStateProps = {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-fg text-sm font-medium">{title}</p>
      {body ? (
        <p className="text-fg-muted max-w-prose text-sm">{body}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
