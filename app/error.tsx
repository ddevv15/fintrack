"use client";

import { Button } from "@/components/ui/Button";

/**
 * The last catch, for what a component's own error state could not hold.
 *
 * Next requires an error boundary to be a Client Component, which is why this
 * file carries "use client" while everything in components/ui/ except AppNav
 * does not.
 *
 * It shows the real message. A generic apology here would hide the one piece of
 * information that makes the failure actionable, and this is a money app: an
 * honest error beats a confident wrong screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main"
      className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center"
    >
      <div role="alert" className="flex max-w-md flex-col items-center gap-2">
        <h1 className="text-fg text-lg font-semibold">Something broke</h1>
        <p className="text-fg-muted text-sm">{error.message}</p>
        {error.digest ? (
          <p className="text-fg-subtle text-sm">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>

      <Button onClick={reset} variant="secondary">
        Try again
      </Button>
    </main>
  );
}
