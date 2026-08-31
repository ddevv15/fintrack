import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

import { env, publicEnv } from "@/lib/env";
import { monitoringOptions, shouldReport } from "@/lib/monitoring";

/**
 * Server side error reporting (spec 0011).
 *
 * Next calls `register()` once when a server instance starts, and
 * `onRequestError` whenever it catches an error from a Server Component, a
 * Server Action, a route handler, or the proxy. Together they are every server
 * path this app has.
 *
 * Nothing here is allowed to break a request. Every branch either returns
 * quietly or is wrapped, because a money app whose pages fail when its
 * monitoring fails has traded a real problem for a worse one. This is the same
 * fail open rule `lib/attempt-limit.ts` follows for Arcjet, and it applies with
 * more force here: rate limiting at least protects something, monitoring only
 * watches.
 */

/** Whether `register()` actually initialised, so the hook knows not to bother. */
let started = false;

/**
 * Start reporting, or say once why it is off.
 *
 * The log line is the point of the else branch. A monitoring setup that is
 * silently disabled looks exactly like one that is working and has nothing to
 * report, and the difference only becomes visible on the day you needed it. So
 * absence is stated out loud, once, at boot, naming what is unwatched, exactly
 * as `lib/attempt-limit.ts` does for a missing `ARCJET_KEY`.
 */
export function register(): void {
  const environment = publicEnv().NEXT_PUBLIC_VERCEL_ENV ?? env().VERCEL_ENV;

  const options = monitoringOptions({
    dsn: publicEnv().NEXT_PUBLIC_SENTRY_DSN,
    environment,
    release:
      publicEnv().NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      env().VERCEL_GIT_COMMIT_SHA,
  });

  if (!options) {
    // Only worth saying where reporting was plausibly wanted. On a laptop this
    // is the normal state and a warning every boot would just be noise.
    if (shouldReport(environment)) {
      console.warn(
        "[monitoring] NEXT_PUBLIC_SENTRY_DSN is not set, so no error in this deployment is reported anywhere. Nothing is watching for a crash or for a completeness guard refusing a read. Set it in the hosting project.",
      );
    }
    return;
  }

  try {
    Sentry.init(options);
    started = true;
  } catch (error) {
    console.warn("[monitoring] could not start error reporting", error);
  }
}

/**
 * Report one server error, then make sure it actually left.
 *
 * The flush is not belt and braces. A serverless function can be frozen as soon
 * as its response is sent, and `captureRequestError` only queues; without
 * awaiting the flush the report is cut off in transit and vanishes, which is
 * the exact failure this whole feature exists to remove. Next's own
 * documentation for this file says to await any async work here, and this is
 * what it means in practice.
 *
 * The timeout is bounded rather than unlimited so a slow or unreachable Sentry
 * cannot hold a request open. Losing a report is acceptable; hanging a page is
 * not.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (!started) return;

  try {
    Sentry.captureRequestError(error, request, context);
    await Sentry.flush(2000);
  } catch {
    // Swallowed on purpose. An error while reporting an error must not become
    // a third error, and there is nowhere useful left to report it to.
  }
};
