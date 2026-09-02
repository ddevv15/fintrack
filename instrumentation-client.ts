import * as Sentry from "@sentry/nextjs";

import { publicEnv } from "@/lib/env";
import { monitoringOptions } from "@/lib/monitoring";

/**
 * Browser side error reporting (spec 0011).
 *
 * Next runs this file after the document loads and before React hydrates, which
 * is early enough to catch a failure during hydration itself. Unlike the server
 * file it exports no required function; the top level code is the setup.
 *
 * This half exists because of the log form. Every money read happens on the
 * server and is covered there, but logging a spend crosses a client boundary,
 * and that is the one place an entry can actually be lost. A server only setup
 * would watch everything except the thing worth watching.
 *
 * It reads `publicEnv()` rather than `env()`. The full schema is mostly server
 * values that simply do not exist in a bundle, so `env()` here would throw on
 * configuration the browser was never meant to see.
 */
try {
  const options = monitoringOptions({
    dsn: publicEnv().NEXT_PUBLIC_SENTRY_DSN,
    environment: publicEnv().NEXT_PUBLIC_VERCEL_ENV,
    release: publicEnv().NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  });

  if (options) Sentry.init(options);
} catch {
  // Wrapped because Next's own guidance for this file says to: it runs before
  // hydration, so a throw here would break the page before React ever starts.
  // Silent rather than logged, because a console warning on every load of a
  // correctly unconfigured local build is noise, and the server half already
  // says once, at boot, when reporting is off where it was wanted.
}

/**
 * Follow navigations so a client side route change is attributed correctly.
 *
 * Without this a browser error is filed against whichever route first loaded,
 * which on an app you move around in makes the route field actively misleading.
 * Sentry supplies the hook; Next calls it at the start of each App Router
 * navigation.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
