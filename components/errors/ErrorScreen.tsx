"use client";

import { Button } from "@/components/ui/Button";

/**
 * The full page failure screen, shared by both error boundaries.
 *
 * It exists because there are two boundaries and they must look identical.
 * `app/error.tsx` catches anything below the root layout; `app/global-error.tsx`
 * catches the root layout itself failing. The second one replaces the layout
 * when it renders, so it has to supply its own `html` and `body` and cannot
 * simply be the first one copied. Everything inside those tags is the same
 * screen though, so it lives here once.
 *
 * `"use client"` for the same reason `app/error.tsx` carries it: Next requires
 * an error boundary to be a Client Component, and retrying is a callback rather
 * than a form posting a server action. That is why this cannot reuse
 * `components/ui/ErrorState`, which is a Server Component by design and whose
 * retry is a form.
 *
 * It shows the real message. A generic apology would hide the one piece of
 * information that makes a failure actionable, and this is a money app: rule 3
 * of `AGENTS.md` is that an honest error beats a confident wrong screen.
 */
export function ErrorScreen({
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
