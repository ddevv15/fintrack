# 0011. Report errors to Sentry, with money and typed text stripped before they leave

**Date**: 2026-08-31
**Status**: In Progress

## Summary

When something breaks in FinTrack today, nobody finds out. This decision sends errors to Sentry (a service that collects crashes, groups them into issues, and emails you about new ones) and emails you the first time each new problem appears. Two things make this more than a plug in. The app throws deliberate refusals when it cannot prove a money figure is whole, and those refusals are the most valuable thing it can tell you, so they are reported too and tagged so they read differently from a crash. And every report is built from an allow list, meaning it carries only what is explicitly permitted, so an amount, a note, a merchant name, or a session cookie cannot travel even if a future version of the reporting library starts collecting new things.

## Requirements

**User stories**:

- As the person who owns this money, I want to find out when something broke, so that a lost entry or a refused read is something I learn about rather than something I stumble on months later.
- As the person who owns this money, I want a break to reach my email, so that finding out does not depend on me remembering to open a dashboard.
- As the person who owns this money, I want nothing about my spending to leave the app, so that improving my monitoring does not cost me my privacy.
- As the person maintaining this alone, I want monitoring that cannot take the app down, so that the thing watching for failure is never the cause of one.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: An unhandled error thrown in a Server Component, a Server Action, a route handler, or the browser reaches Sentry as an issue.
- **AC-2**: A deliberate refusal reaches Sentry tagged so it is distinguishable from a crash at a glance, without reading the message. The refusals in scope are the completeness guards: `assertCompleteMonthRead()` in `lib/month.ts`, and `assertExportCountMatches()` and the missing count throws in `lib/export.ts`.
- **AC-3**: The first occurrence of a new issue sends an email. Later occurrences of an issue already seen do not.
- **AC-4**: No money amount appears anywhere in a report. This holds as a property of how a report is built, not as a claim about what the SDK collects today: the builder copies only the fields named in **Report shape** below, so an amount cannot travel whether or not Server Action arguments are ever attached to an event.
- **AC-5**: No text the person typed appears in a report. A URL carrying history filters, for example `/history?note=coffee`, reaches Sentry with its query string removed.
- **AC-6**: No cookie and no `Authorization` header travels with a report.
- **AC-7**: Console and network breadcrumbs (the trail of recent activity Sentry records before an error) are never collected, switched off at the SDK rather than removed on the way out. A field never gathered cannot leak through a builder somebody later edits. The builder drops any that arrive anyway, as a second line.
- **AC-8**: A report names the account by user id only. No email address appears in any field.
- **AC-9**: Production and preview deployments report. Everything else sends nothing, and the gate is written as an allow list naming those two rather than as an exclusion of `development`. A local machine does not set `VERCEL_ENV` at all, so an exclusion would let it through.
- **AC-10**: A stack trace in a report names a real source file and line number, not a position in a minified bundle.
- **AC-11**: Every report is tagged with the commit it was built from.
- **AC-12**: If Sentry is unreachable, misconfigured, rate limited, or over quota, every request behaves exactly as it does with monitoring absent. No error path changes, no request fails, nothing is slower in a way a person notices.
- **AC-13**: With no DSN configured the app runs normally and logs one readable line saying monitoring is off and what is therefore unwatched, matching how `lib/attempt-limit.ts` reports a missing `ARCJET_KEY`.
- **AC-14**: Performance tracing and session replay are both off, and the configuration says so explicitly rather than relying on a default.
- **AC-15**: No database change. No new table, no migration, no row level security policy.
- **AC-16**: The error page a person sees is unchanged from today, including the existing `error.digest` reference line.
- **AC-17**: The report builder is pure and unit tested: given a fabricated event containing an amount, a note, a merchant, a cookie, a query string, and breadcrumbs, it returns an event containing none of them.

## Decision

**Chosen option**: Option 1: Sentry, with an allow list report builder

Send errors to Sentry through its Next.js SDK, capturing server and browser, gated to production and preview, with every outgoing report rebuilt from an allow list so nothing about a person's money can travel, and with the app's deliberate refusals reported under their own tag.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**:

No entities, no tables, no columns, no migration. Reports live in Sentry. This is deliberate and follows spec 0004, which declined an audit log on the reasoning that a record of your own actions, readable only by you, adds a table and answers no question. The same holds here: a local copy of an error you were already emailed about is storage without a reader.

**State transitions**: none. An error report has no lifecycle this app owns. Sentry's own issue states (new, resolved, ignored) are the vendor's and are not modelled here.

**API surface**:

No routes are added and no existing route changes its contract. The surface is the set of places capture is installed.

| Surface | Mechanism | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Server request errors | `instrumentation.ts`, exporting `onRequestError` | the thrown error, the request, the router context | an event sent to Sentry, or nothing | inherits the request | send fails, swallowed (AC-12) |
| Server startup | `instrumentation.ts`, `register()` | `NEXT_PUBLIC_SENTRY_DSN`, `VERCEL_ENV` | an initialised client, or none | none | no DSN, logs once and returns (AC-13) |
| Browser | `instrumentation-client.ts` | same DSN, read from the bundle | an event sent to Sentry, or nothing | none | send fails, swallowed (AC-12) |
| Root layout crash | `app/global-error.tsx` (new file) | the thrown error | the error captured, then the existing error UI | none | none |
| Deliberate refusals | the existing throw sites in `lib/month.ts` and `lib/export.ts` | the refusal message and its kind | an event tagged as a refusal | inherits the request | none |

**Report shape** (the allow list, and the whole privacy guarantee):

The builder takes Sentry's `ErrorEvent` and returns a new object built by copying only the fields below. It never mutates the input and never deletes from it, because deleting is a deny list wearing different clothes. Anything absent from this list does not travel.

| Field kept | Why it is safe to send |
|---|---|
| `event_id`, `timestamp`, `platform`, `level` | Identifiers and metadata, no user content |
| `environment` | `production` or `preview`, from the gate below |
| `release` | The commit hash (AC-11) |
| `exception`, including type, value, and stack frames | The error and where it came from. The `value` is the app's own written message, which is the one field carrying prose, and the invariant below governs it |
| `tags` | Only tags this app sets, including the refusal tag (AC-2) |
| `user.id` | The user id alone. The email sits on the same session object and is never copied (AC-8) |
| `request.url`, query string removed | The route that failed, without the filters typed into it (AC-5) |

Not copied, and therefore not sent: request headers and cookies (AC-6), request body and Server Action arguments (AC-4), breadcrumbs (AC-7), `contexts`, `extra`, `modules`, and every field a future SDK version introduces.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Capture any error | the release the report belongs to | `VERCEL_GIT_COMMIT_SHA`, provided by Vercel on every build; falls back to unset locally, where nothing sends anyway |
| Capture any error | the environment name, and whether to report at all | `VERCEL_ENV`, set by Vercel on its own builds and deployments. It is **unset** on a local machine, because this project's onboarding copies `.env.example` rather than running `vercel env pull`. So the gate names the two values that may report, `production` and `preview`, and treats every other value including unset as off. Written the other way round, as "not `development`", an unset value passes and a laptop reports (AC-9) |
| Capture any error | whether monitoring runs at all | `NEXT_PUBLIC_SENTRY_DSN` read through `env()` in `lib/env.ts`, optional, absent means off |
| Capture any error | the account it happened to | the signed in user id from the InsForge session, the same value row level security keys on; never the email, which is on the same session object and must be left there (AC-8) |
| Capture any error | a readable file and line | the source map uploaded at build time and keyed by release, authenticated with `SENTRY_AUTH_TOKEN` (AC-10) |
| Capture a refusal | the tag marking it a refusal, not a crash | a `kind` field on an error type exported from a new `lib/errors.ts`, thrown by the guards and read by the builder. That module imports nothing, and specifically not the Sentry SDK, so `lib/month.ts` and `lib/export.ts` stay free of side effects as `AGENTS.md` requires. The SDK stays at the edge, in the instrumentation files (AC-2) |
| Capture a refusal | which guard refused | the `what` argument the guards already take, for example `Your transactions`, already written to name the read in its message |
| Email on a new issue | whether this issue is new | Sentry's own issue grouping and its alert rule; not computed here (AC-3) |
| Show the error page | the reference code a person sees | `error.digest`, already produced by Next.js and already rendered by `app/error.tsx`; unchanged by this feature (AC-16) |

**Key invariants**:

- A report is built by naming what may be included, never by removing what may not. Anything the builder does not explicitly copy does not travel. This is the invariant AC-4 through AC-7 all rest on, and it is what makes them survive a future SDK version that starts collecting something new. Its one gap, recorded rather than hidden: `beforeSend` governs error events only, so Sentry's own session envelopes never pass through the builder. They carry aggregate counts, the release, the environment, and the user id, and `dataCollection.userInfo: false` keeps an IP off them, which was checked against a live send rather than assumed.
- Where the SDK offers a switch, a field is not gathered at all rather than gathered and then dropped. That now covers breadcrumbs, cookies, headers, bodies, query strings, **the stack frame locals**, the source context lines, and the returned database rows. The builder still drops every one of them, and that is still the guarantee; never gathering is the second line, so a future edit to the builder cannot quietly become the only one.
- No value that originated in the `transactions` or `profiles` tables ever appears in a report, in any field, including inside a message.
- Capturing an error never changes what the app does. Every send path is wrapped so a failure inside monitoring cannot propagate (AC-12).
- Monitoring absent and monitoring present are the same app. Removing the DSN is a supported configuration, not a broken one (AC-13).
- The error message itself does travel, because a report without it is worthless. The messages in scope are the app's own written prose, which carry row counts and read names rather than amounts. Any future throw site that would put a value into a message is a change to this invariant, not a detail. **Audited 2026-08-31**, and it did not hold on arrival: six read sites interpolated `JSON.stringify(result.error)`, an opaque driver payload that Postgres can fill with the offending literal, into a message this feature then reports. They now log the payload server side and throw fixed prose from `fault()` in `lib/errors.ts`. Zod messages were audited in the same pass and carry paths, expected types, and schema constants only, never a submitted value.

**Security model**:

One owner, one account, reading their own rows. Reports carry a pseudonymous user id and no other identifier, so a Sentry account compromise exposes stack traces and the app's own error prose, not anybody's spending.

No regulatory scope is triggered. There is no card data, so PCI does not apply; no health data, so HIPAA does not apply. The bar here is self imposed by the scope row rather than imposed by a regulator, which is worth saying plainly: nothing external will catch a leak, so the allow list is the only thing standing between an amount and a third party.

`SENTRY_AUTH_TOKEN` is a build time credential and must never reach a bundle. It is deliberately not prefixed `NEXT_PUBLIC_`, unlike the DSN, which must reach the browser to work.

**Configuration required**:

- `NEXT_PUBLIC_SENTRY_DSN`: where reports are sent. Public by necessity, since the browser SDK needs it, and public is acceptable: a DSN accepts events, it does not read them. Optional, following the `ARCJET_KEY` precedent in `lib/env.ts`, so an unset value means monitoring is off rather than the app refusing to boot.
- `SENTRY_AUTH_TOKEN`: build time only, authorises the source map upload. Never bundled, never read at runtime.
- `SENTRY_ORG` and `SENTRY_PROJECT`: which Sentry project the maps upload to.

Prerequisite before any code: a Sentry account and project must exist, and the Sentry MCP plugin in this session is installed but unauthorised, so it needs authorising before it can be used to read issues back.

**Critical test scenarios**:

- Happy path: throw in a Server Component on a preview deployment, an issue appears in Sentry with a readable stack trace and the commit tagged, and an email arrives, verifies **AC-1**, **AC-3**, **AC-10**, **AC-11**.
- Privacy, the one that matters: hand the report builder a fabricated event carrying an amount, a note, a merchant, a cookie, a `?note=coffee` query string, and a set of breadcrumbs, and it returns an event carrying none of them, verifies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-17**.
- Environment gate, the one that would bite quietly: with `VERCEL_ENV` unset, as it is on a local machine, and a real DSN configured, nothing is sent. This is the case an exclusion style gate would let through, verifies **AC-9**.
- Refusal path: force a count mismatch so `assertExportCountMatches()` throws, and the issue arrives tagged as a refusal rather than looking like a crash, verifies **AC-2**.
- Failure case: point the DSN at an unreachable host, then use the app normally. Every screen behaves exactly as before and no request fails, verifies **AC-12**.
- Absent configuration: unset the DSN, boot, and the app runs with one log line naming what is unwatched, verifies **AC-13**.
- Environment gating: throw locally and confirm nothing is sent, verifies **AC-9**.

## Build plan

Ordered Skateboard style per `AGENTS.md`: the thinnest usable whole first, then grow. One thing about that ordering is load bearing and not obvious. The privacy work comes before capture is switched on, not after. A build that reports first and scrubs later has already sent amounts to a third party by the time the scrubber lands, and there is no unsending them. So the smallest shippable whole here is not "errors reach me", it is "errors reach me and nothing about my money went with them".

1. [x] Add `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` to `lib/env.ts`, the DSN optional and normalising empty string to undefined exactly as `ARCJET_KEY` does, and document all four in `.env.example`, satisfies **AC-13**.
2. [x] Write the allow list report builder as a pure function in its own module, taking Sentry's `ErrorEvent` and returning a new object carrying only the fields in **Report shape**. Unit test it against a fabricated event carrying an amount, a note, a merchant, a cookie, a query string, and breadcrumbs, asserting none survive, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-17**.
3. [x] Add `instrumentation.ts` with `register()` and `onRequestError`, initialising Sentry only when a DSN is present **and** `VERCEL_ENV` is exactly `production` or `preview`, never by excluding `development`. Wire the builder from step 2 as the outgoing filter, switch the console and network breadcrumb integrations off so nothing is collected, disable tracing and replay explicitly, and flush a report before the handler returns so a frozen serverless function cannot cut an in flight send, satisfies **AC-1**, **AC-9**, **AC-12**, **AC-14**.
4. [x] Attach the user id from the session, and nothing else from it, satisfies **AC-8**.
5. [ ] Configure the alert rule so a new issue emails you and a recurrence does not, satisfies **AC-3**. **Not done.** Two reports were accepted and both appeared as issues on 2026-08-31, so everything up to Sentry's door works, but no email arrived for either. Assuming a project gets a working new issue rule by default was wrong. This is the last open item in the feature, and it is the one the whole feature exists for: a dashboard you have to remember to open is the problem this was meant to solve.
6. [x] Add `instrumentation-client.ts` and `app/global-error.tsx`, so a browser failure and a root layout crash are both captured. `global-error.tsx` replaces the root layout when it renders, so it must supply its own `<html>` and `<body>`; it cannot be a copy of `app/error.tsx`, which sits inside the layout and supplies neither. Extract the shared inner markup so both render the same thing, and leave `app/error.tsx` itself untouched, satisfies **AC-1**, **AC-16**.
7. [x] Add `lib/errors.ts` exporting the error type carrying a `kind` field, importing nothing. Throw it from the guards in `lib/month.ts` and `lib/export.ts` in place of a bare `Error`, keeping both modules free of any SDK import, and read `kind` in the builder to set the tag, satisfies **AC-2**.
8. [x] Wrap `next.config.ts` with the Sentry build plugin so source maps upload and the release is set from `VERCEL_GIT_COMMIT_SHA`, keeping the existing Turbopack root pin intact, satisfies **AC-10**, **AC-11**.
9. [x] Confirm no migration was added and no schema changed, satisfies **AC-15**.

## Consequences

**Positive**:

- The app stops failing silently. The scope row's whole complaint is answered: a break reaches you without you going to look.
- The completeness guards become useful rather than merely correct. Three specs have built machinery that refuses to show a money figure it cannot prove, and until now that machinery could fire without anybody ever knowing. Reporting it turns a guard into a signal.
- The allow list is reusable. Any later feature that sends anything anywhere has a worked example of the shape.
- The pure report builder is testable with no backend and no network, which matches how `lib/export.ts` split its pure half from its reading half.

**Negative / tradeoffs**:

- A second vendor and a second dashboard, against spec 0001's stated preference for one platform. That preference was real and this decision spends it.
- An allow list costs more to maintain than a deny list. Every genuinely useful new field has to be added deliberately, and somebody will eventually be annoyed that a report is missing context they wanted.
- Source map upload adds a build step and a token to keep alive. A rotated or expired token degrades quietly: reports keep arriving, they just stop being readable.
- Reporting the refusals means a noisy period is possible. If a guard fires often for a reason nobody predicted, the email that was supposed to be rare becomes the email you filter.
- The free tier is a real ceiling and this spec does not measure it. An error loop could exhaust a month's quota in an afternoon, and the fail open design means you would find out by reports stopping rather than by anything breaking.

**Neutral**:

- Do not run the Sentry setup wizard on this project. It was run on 2026-08-31 and produced a second, parallel setup that contradicted this spec in four ways: `sentry.server.config.ts` and `sentry.edge.config.ts` initialising with `tracesSampleRate: 1`, no `beforeSend`, no environment gate, and a DSN hardcoded in committed source; `next.config.ts` overwritten, losing `deleteSourcemapsAfterUpload`, `telemetry: false`, and the token read; a `tunnelRoute: "/monitoring"` that `proxy.ts` redirects, which would have swallowed every browser report silently; and a `webpack` options block that does nothing because this project builds with Turbopack. The two config files were inert in SDK 10.72, which is the only reason nothing leaked. All of it was removed and the spec's own configuration restored. The wizard assumes the ungated, unfiltered default setup this spec deliberately does not use.

- This supersedes exactly one row of spec 0001: `Observability: PostHog, designed at Feature 12`, along with its config line `PostHog keys: added when Feature 12 designs error monitoring, not before`. Everything else in 0001 stands. PostHog is not ruled out for product analytics later, where its argument still holds.
- Spec 0001's open follow up `[ ] Authorize the PostHog MCP server` existed to serve this feature and no longer blocks anything.
- The comment in `lib/env.ts` naming "PostHog keys" as a future addition is now stale prose.
- Next.js has renamed and moved instrumentation hooks more than once. The file names here are correct for Next 16 and are the kind of thing worth checking against `node_modules/next/dist/docs/` at build time rather than trusting from memory.

## Follow-up

- [ ] Measure the free tier against real volume once a month of reports exists, and decide whether a sampling rule or a quota alert is needed. This spec deliberately sets no sampling, on the reasoning that a personal app should not generate enough errors to need one, which is an assumption rather than a measurement.
- [ ] Decide what happens if the refusal tag turns out to be noisy in practice. The options are a digest rather than a per issue email, or a separate alert rule for refusals, and neither is worth building before there is evidence.
- [x] The Sentry Agent Skills available in this session (`sentry-instrument`, `sentry-setup-releases`, `sentry-fix-stack-traces`) are not recorded in root `AGENTS.md` under `## Agent skills`. They are project wide, since instrumentation touches every layer, so they belong at root level once this is built. **Done 2026-08-31.**
- [x] Update the stale `lib/env.ts` comment that names PostHog keys as the future addition, and the matching row in spec 0001. **Done 2026-08-31**, along with spec 0001's config line and its open PostHog MCP item, which no longer blocks anything.
- [ ] Confirm how a report is flushed before a Vercel function can freeze, against the Next 16 and Sentry versions actually installed. Build task 3 requires it, and the exact mechanism is the part of this spec written with the least certainty. Getting it wrong drops reports silently under real traffic, which is the failure mode this whole feature exists to remove.
- [x] Consider whether any Zod validation error can echo a submitted value into its message. **Audited 2026-08-31.** Zod v4 was checked against a hostile object and its messages name the path, the expected type, and the schema's own constants, never the received value. The audit did find the real instance of this leak elsewhere, in the six `JSON.stringify(result.error)` read sites, now fixed. See the message invariant above.
- [ ] A server report may not name the route that failed. Next's `onRequestError` hands over `{ path, method, headers }` with no `url`, and a live send confirmed the event arrived with no `request` field at all, so `report.request.url` is populated for browser events only. `transaction` is not on the allow list either. `context.routePath` is available and is a route pattern rather than typed text, so adding it as a tag is safe and would make a server report actionable. Confirm the shape on a real deployment first, then decide.
- [ ] Decide whether Sentry's session envelopes are worth keeping. They bypass `beforeSend` by design, which is the one hole in the allow list, and release health answers no question this app asks. Turning session tracking off would make the invariant above true without qualification.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
