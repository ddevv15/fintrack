import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this Turbopack walks up and finds the stray
  // package-lock.json in the home directory, then warns on every build.
  turbopack: {
    root: __dirname,
  },
};

/**
 * Wrapped so the build uploads source maps (spec 0011 AC-10, AC-11).
 *
 * Without this a browser stack trace names a position inside a minified bundle,
 * which is close to unreadable and makes a report something you can see but not
 * act on. The upload ties each build's maps to its commit, so a trace months
 * later still resolves to the file and line it came from.
 *
 * Every credential here is optional, and the build must survive their absence:
 * a normal local checkout has none of them, and failing the build because
 * nobody configured monitoring would be the tail wagging the dog. Missing token
 * means no upload, and reports that are simply harder to read.
 *
 * `sourcemaps.deleteSourcemapsAfterUpload` keeps the maps out of the deployed
 * output. They are uploaded to Sentry, which is where they are useful; leaving
 * them served next to the bundle publishes this app's source to anyone who asks.
 *
 * There is deliberately no `disableLogger` option here. It strips the SDK's own
 * debug logging from the client bundle, it is deprecated in this version, and
 * the replacement it points at does not work under Turbopack, which this
 * project uses. So the real choice is a deprecation warning on every typecheck
 * or a slightly larger bundle, and the quiet build wins.
 *
 * The three values are read from `process.env` here rather than through
 * `lib/env.ts`, which is the one deliberate exception to that rule in the
 * codebase. This file is build tooling, not app code: it is loaded by Next
 * before the app exists, so importing the app's `@/` aliased modules is not
 * reliable, and `env()` would throw on server values that are not set yet at
 * config load. They are still declared and validated in `lib/env.ts` for every
 * consumer that runs inside the app.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Quiet unless something is wrong. A build log that prints upload chatter on
  // every run trains you to skim past the line that actually matters.
  silent: true,
  telemetry: false,

  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
