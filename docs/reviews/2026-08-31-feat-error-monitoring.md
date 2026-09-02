# Review, feat/error-monitoring, 2026-08-31

**Reviewed by**: Claude (Sonnet 5) (author on unspecified)
**Scope**: 19 files (excl. package-lock.json), branch vs `main` (merge base `26a02ce`)
**Verdict**: Changes requested

## Summary

This lands Sentry-based error monitoring with an allow-list report builder (`lib/monitoring.ts`) that rebuilds every outgoing event field-by-field rather than filtering an existing one, plus a `RefusalKind` tag (`lib/errors.ts`) so the app's deliberate completeness guards read differently from crashes. The privacy-critical unit suite (`tests/unit/monitoring.test.ts`, 22 tests) is genuinely good: it searches serialized output for raw values rather than trusting field names, and it passes. Typecheck and lint are clean. The design is well reasoned and the spec (0011) is unusually candid about its own residual risk, including a follow-up that already anticipates one of the gaps below.

The problems are all in the gap between the stated invariant ("nothing travels except what is named here" / "nothing here is allowed to break a request") and a few specific lines that don't quite live up to it: an unguarded `env()`/`publicEnv()` call in `register()`, an SDK default (`stackFrameVariables`) left uncleared at the exact field the code's own comments call the most dangerous one, and a pre-existing read-failure message that can now, for the first time, actually leave the process carrying a raw database error.

## Resolution, 2026-08-31

All three majors are fixed, plus two minors and both nits. What changed:

- `register()` now wraps its whole body, not just `Sentry.init`. Proved by booting the real server with a deliberately broken `APP_TIMEZONE`: monitoring logs one line and steps aside, the server becomes ready and answers, and the app still refuses loudly on the request itself.
- `dataCollection` now sets `stackFrameVariables: false`, `frameContextLines: 0`, and `databaseQueryData: false`, so the frame locals are never gathered rather than gathered and stripped.
- The raw driver payload is gone from every reported message. The review found two sites; the same pattern turned out to exist at six, across `lib/month.ts`, `lib/export.ts`, `lib/transactions.ts`, and `lib/categories.ts`. All six now log the payload server side and throw fixed prose from a new `fault()` builder. Zod messages were audited in the same pass and echo no submitted value.
- `mechanism` is rebuilt from three named fields instead of copied whole.
- `register()` and `onRequestError` now have tests (8), and `fault()` and `refusal()` have their own (5). The suite is 324 across 22 files.
- Both nits are done: `lib/env.ts` records the `next.config.ts` exception and points at `publicEnv()`, and `.env.example` warns that the DSN must be set before the build that ships it.

Left open, both recorded in spec 0011's follow up list rather than fixed here: the route naming gap (needs a real deployment to confirm the shape first) and the session envelope hole (a design call about whether release health is worth keeping at all).

## Major

### 🟠 `register()` can throw before the server is ready, contradicting this file's own fail-open contract, `instrumentation.ts:35-37`

**Problem**: `register()` calls `publicEnv()` and `env()` directly, with no `try`/`catch`:
```ts
export function register(): void {
  const environment = publicEnv().NEXT_PUBLIC_VERCEL_ENV ?? env().VERCEL_ENV;
  const options = monitoringOptions({
    dsn: publicEnv().NEXT_PUBLIC_SENTRY_DSN,
    ...
    release: publicEnv().NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? env().VERCEL_GIT_COMMIT_SHA,
  });
```
Both functions throw on a missing or invalid required value (`APP_URL`, `APP_CURRENCY`, `APP_TIMEZONE`, `NEXT_PUBLIC_INSFORGE_URL`, etc. — see `lib/env.ts:201-217`, `234-250`). Only the `Sentry.init(options)` call a few lines down is wrapped.

**Why it matters**: This file's own doc comment states the design goal plainly: "Nothing here is allowed to break a request. Every branch either returns quietly or is wrapped... a money app whose pages fail when its monitoring fails has traded a real problem for a worse one." Next's docs say `register()` "must complete before the server is ready to handle requests," so a throw here is a boot-time failure, not a per-request one. Before this change, a misconfigured non-Sentry env var (e.g. a malformed `APP_URL`) would only break whichever route first touched `env()`. Now it can prevent the server instance from ever becoming ready, which is a strictly larger blast radius than the "monitoring must never make anything worse" promise this file makes about itself, and it is monitoring code doing it, not the app code the throw is nominally about.

**Suggested fix**: Wrap the two `env()`/`publicEnv()` reads (or the whole body of `register()`) in the same `try`/`catch` that already guards `Sentry.init`, and log-and-return on failure rather than propagating.

### 🟠 `stackFrameVariables` — the field this file's own comments call "the dangerous field" — is left at the SDK default, `lib/monitoring.ts:96-105`

**Problem**: `dataCollection` in `monitoringOptions()` turns off `userInfo`, `cookies`, `httpHeaders`, `httpBodies`, and `urlQueryParams`, but does not set `stackFrameVariables: false` (nor `frameContextLines: 0`, nor `databaseQueryData: false`). Checked against the installed SDK's own types (`node_modules/@sentry/core/build/types/types/datacollection.d.ts`), `stackFrameVariables` defaults to `true`, meaning the SDK collects every local variable at every stack frame before `beforeSend` ever runs. The comment above `keepFrame()` (`lib/monitoring.ts:167-176`) says exactly this: "`vars`... is a map of every local variable in scope at that frame, so on any throw inside a save or a total it holds the amount."

**Why it matters**: The whole file's stated design principle, applied consistently everywhere else, is "never collected rather than collected and then dropped" (verbatim, about breadcrumbs: "A field never gathered cannot leak through a builder somebody later edits"). That principle is not applied to the one field the code itself flags as the most dangerous. Today the only thing standing between an amount sitting in `frame.vars` and it leaving the process is `keepFrame()` in `buildReport()` never being weakened — which is precisely the "one line of defense, no feedback loop" failure mode spec 0011's rationale says an allow list exists to avoid. If a later edit to `keepFrame()` ever spreads a frame instead of naming its fields (an easy, plausible refactor), the leak would be silent, exactly as the spec describes as the worst case.

**Suggested fix**: Set `dataCollection.stackFrameVariables: false` (and consider `frameContextLines: 0`) alongside the fields already turned off, so the defense is "never gathered" rather than "gathered, then hopefully stripped," consistent with how breadcrumbs are already handled.

### 🟠 A pre-existing read-failure message can now carry a raw database error to a third party for the first time, `lib/month.ts:249`, `lib/export.ts:304`

**Problem**: The "fault" throw sites (as opposed to the refusal ones) build their message as:
```ts
throw new Error(`Could not read ${what.toLowerCase()}: ${JSON.stringify(result.error)}`);
```
`result.error` is whatever PostgREST/Postgres returns for a failed query. One of the filters that reaches a live query unvalidated is the note search term (`lib/history.ts` `q` param, capped at 500 chars, passed through `escapeLikeTerm()` into `.ilike("note", ...)` in `lib/month.ts:224-226`) — i.e., user-typed text about their own spending. `buildReport()` deliberately keeps `exception.value` verbatim ("The message travels on purpose... this project writes its errors as readable sentences precisely so they can be read"), so whatever lands in this message now reaches Sentry.

**Why it matters**: Spec 0011's own invariant states "the messages in scope are the app's own written prose, which carry row counts and read names rather than amounts. Any future throw site that would put a value into a message is a change to this invariant, not a detail" — and its follow-up section already asks for an audit of "whether any Zod validation error can echo a submitted value into its message," but scopes that ask to Zod validators, missing this call site. `JSON.stringify(result.error)` is not app-written prose; it's an opaque passthrough of whatever the database driver says, and Postgres error text is well known to echo the offending literal value in some failure classes (e.g. `invalid input syntax for type X: "<value>"`). This throw site is unchanged by this diff, but this diff is precisely what turns it from "goes nowhere" into "travels to a third party" for the first time — the exact silent, no-feedback-loop failure mode this whole feature is built to guard against elsewhere.

**Suggested fix**: At minimum, don't interpolate `JSON.stringify(result.error)` into a message that will be reported; log the structured error server-side only, and put a fixed, generic string in the thrown message (or route driver errors through `lib/errors.ts` with their own kind, keeping the raw driver payload out of anything Sentry-bound). Given the audit already promised in the spec's follow-up list, this call site should be in scope for it.

## Minor

### 🟡 Server-captured errors likely carry no route information at all, `lib/monitoring.ts:216-219`
Next 16's documented `onRequestError` request shape is `{ path, method, headers }` — there is no `url` field (`node_modules/next/dist/docs/.../instrumentation.md`), and the project's own `/check verify` run against a real ingest observed "the event carried no `request` field at all" for a server-captured error. `transaction` (which would otherwise name the route) is not on the allow list either. `report.request.url` in `buildReport()` is therefore likely dead code for the majority of AC-1's surfaces (Server Components, Server Actions, route handlers) and only populated for browser-originated events. AC-1 itself still holds (an issue appears), but a server report may not say which route failed, which weakens the report's practical actionability. Worth confirming once a real deployment exists (verify.md already tracks this as unticked) and, if confirmed, adding `context.routePath` (already available to `onRequestError`, not currently used) as a tag.

### 🟡 The browser half can go silently dark with no symptom if `NEXT_PUBLIC_SENTRY_DSN` isn't present at build time, `instrumentation-client.ts:22-31`
`NEXT_PUBLIC_*` values are inlined into the client bundle at build time. If the DSN is added to the hosting project after a build, or only reaches the runtime environment rather than the build environment, the server half (reading via `env()`/`publicEnv()` at runtime) starts reporting while the browser half silently never initializes — and the `catch` block here is deliberately silent, on the reasoning "the server half already says once, at boot, when reporting is off." That reasoning only holds when server and browser configuration are in sync, which isn't guaranteed by anything in this change. The result is a monitoring setup that looks fully on (server reports arrive) while AC-1's browser coverage is quietly absent, with no log line anywhere pointing at it.

### 🟡 `mechanism` is copied wholesale rather than field-by-field, `lib/monitoring.ts:196`
Every other part of an exception value is rebuilt from named fields (`keepFrame()` explicitly excludes `vars`, `context_line`, etc.), but `mechanism: value.mechanism` copies the whole object. The SDK's own types describe `Mechanism.data` as an open-ended `[key: string]: string | boolean` bag used for "the handler name and the event target." Low practical risk (no money-shaped data expected there), but it's a small inconsistency in a file whose entire premise is "name what you keep," not "copy what looks safe."

### 🟡 Session envelopes bypass `beforeSend` entirely (already surfaced by `/check verify`, independently worth keeping visible)
Confirmed against the installed SDK's option surface and the project's own runtime observation: Sentry's periodic session/release-health envelopes never pass through `beforeSend`, so the allow list's guarantee is scoped to error events, not to everything the SDK sends. Practical risk looks low (aggregate counts; `dataCollection.userInfo: false` should keep IP off them), but the file's own framing — "nothing travels except what is named here" — is slightly broader than what's actually true, and that gap is worth a line in the spec rather than staying implicit.

### 🟡 `register()`'s own branching is untested, `instrumentation.ts:35-56`
`TESTS = configured`. `monitoringOptions()` and `shouldReport()` are well covered, but `register()` — the function that decides whether reporting starts at all, logs the one-line warning, or catches an init failure — has no test. `shouldReport(environment)` gating the warning branch and the catch-and-warn branch on `Sentry.init` throwing are both easily testable by mocking `@sentry/nextjs`'s `init` and asserting on `console.warn`, without needing a real SDK or network call.

## Nits

- ⚪ `next.config.ts:44-46`: reading `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` from `process.env` directly is a deliberate, well-documented exception to the `lib/env.ts` rule — reasonable given Next loads this file before the app's module graph exists — but it's worth a one-line mention in `lib/env.ts`'s own module comment (which currently claims to be the sole place `process.env` is read) so the exception is discoverable from both sides.
- ⚪ `lib/env.ts:6-9`: the module doc comment says "Anything a later feature needs gets added when that feature is built" but the file now has two schemas (`publicEnvSchema`/`envSchema`); a one-line pointer to `publicEnv()` alongside `env()` at the top would save a reader the trip to find it lower down.

## Strengths

- `tests/unit/monitoring.test.ts` is a genuinely excellent privacy test: it fabricates a realistic worst-case event (amount, note, merchant, cookie, `Authorization` header, query string, breadcrumbs, email, IP) and asserts the *serialized* output doesn't contain any of the raw values, rather than checking named fields in isolation — which is exactly the right test for an allow-list design, and it would actually catch a future field the builder forgot to exclude.
- The allow-list construction itself (`buildReport()` assembling a fresh object rather than deleting from the input) is the correct answer to the stated risk, and the code never mutates or partially reuses the source event, which the tests also verify directly.
- `lib/errors.ts`'s non-enumerable `REFUSAL_KIND` property is a nice detail: it survives `throw`/`catch`/rethrow while staying invisible to `JSON.stringify` and anything that spreads the error, so a refusal reads as ordinary prose to every caller except the one that asks for the label by name.
- Keeping `lib/errors.ts` free of any SDK import (so `lib/month.ts` and `lib/export.ts` stay pure) is a real constraint correctly honored, and the `AGENTS.md` purity rule is respected end to end here.

## Test coverage

Good coverage of the pure, privacy-critical surface (`buildReport`, `shouldReport`, `monitoringOptions`, `stripQuery`) — 22 tests, all passing, verified locally. The gap is the thin orchestration layer in `instrumentation.ts` (`register()`'s branches) and `identifyForMonitoring()` in `lib/auth.ts`, neither of which has a test; both are low-complexity but `register()` in particular gates whether the feature does anything at all, which makes its untested branches worth closing per the Minor note above.
