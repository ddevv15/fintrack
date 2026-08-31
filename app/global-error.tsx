"use client";

import * as Sentry from "@sentry/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { useEffect } from "react";

import { ErrorScreen } from "@/components/errors/ErrorScreen";

import "./globals.css";

/**
 * The boundary for the root layout itself failing (spec 0011).
 *
 * This is the only error boundary that has to render `html` and `body`. When it
 * shows, the root layout is what broke, so React has thrown the layout away and
 * there is no document left to render into. That also means the stylesheet has
 * to be imported here and the font variables set here: none of what
 * `app/layout.tsx` normally provides survives to this point. Copying
 * `app/error.tsx` instead would produce markup with no `html` element at the
 * exact moment the page has to work.
 *
 * It is deliberately the plainest screen in the app. Everything it depends on
 * is one more thing that can be broken at the moment it is needed.
 */

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reported from here, unlike `app/error.tsx`, and the difference is real. A
    // root layout failure can happen while rendering in the browser, where
    // nothing on the server ever saw it, so `onRequestError` never fires. This
    // is the only chance to hear about it. It does nothing when monitoring is
    // off, because `Sentry.init` was never called.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
