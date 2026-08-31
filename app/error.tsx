"use client";

import { ErrorScreen } from "@/components/errors/ErrorScreen";

/**
 * The last catch, for what a component's own error state could not hold.
 *
 * Next requires an error boundary to be a Client Component, which is why this
 * file carries "use client" while everything in components/ui/ except AppNav
 * does not.
 *
 * What it renders moved into `ErrorScreen` when spec 0011 added the second
 * boundary, `app/global-error.tsx`, so the two cannot drift apart. What a
 * person sees here is unchanged (AC-16), including the digest reference line.
 *
 * Nothing is reported from this file. An error reaching this boundary was
 * thrown on the server and Next has already handed it to `onRequestError` in
 * `instrumentation.ts`; capturing it again here would file the same failure
 * twice under two different fingerprints.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} />;
}
