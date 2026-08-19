import { cn } from "@/lib/ui";

import { Button } from "./Button";

/**
 * Something failed, and this says what.
 *
 * `detail` carries the real message. Rule 3 in AGENTS.md is that a wrong figure
 * shown confidently is worse than an honest error, so this never substitutes a
 * friendly apology for the thing that actually went wrong.
 *
 * Retry is a form posting a server action, not an onClick. That is what keeps
 * this a Server Component and keeps the client boundary at one file in this
 * whole directory.
 */
type ErrorStateProps = {
  title: string;
  detail?: string;
  retryAction?: () => Promise<void>;
  className?: string;
};

export function ErrorState({
  title,
  detail,
  retryAction,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "border-danger/40 bg-surface flex flex-col items-start gap-2 rounded-md border p-4",
        className,
      )}
    >
      <p className="text-danger text-sm font-medium">{title}</p>
      {detail ? <p className="text-fg-muted text-sm">{detail}</p> : null}
      {retryAction ? (
        <form action={retryAction} className="mt-1">
          <Button type="submit" variant="secondary" size="sm">
            Try again
          </Button>
        </form>
      ) : null}
    </div>
  );
}
