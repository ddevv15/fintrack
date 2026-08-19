import type { ReactNode } from "react";

/**
 * The frame for signing in and creating an account.
 *
 * No nav, because there is nowhere to go yet, and no session read: this is
 * presentational only, so whatever feature 5 decides about authentication does
 * not reach in here.
 */
export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main"
      className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-sm">
        <p className="text-fg-muted mb-6 text-center text-sm font-medium tracking-wide">
          FinTrack
        </p>

        <div className="bg-surface border-border rounded-md border p-6">
          <h1 className="text-fg mb-5 text-lg font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
