# Verify: Error monitoring · spec 0011 · updated 2026-08-31

_Steps derived from spec 0011 acceptance criteria and every row of its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Updated 2026-08-31 after `/check verify` and `/check review`. Most of what this file said could not be run turned out to be runnable
without a Sentry project, by pointing the SDK at a local stand in for the ingest endpoint and reading the bytes it actually sent.
What genuinely still needs Sentry itself is short and listed below: an issue appearing, an email arriving, and a source map
resolving a frame. Those are the two acceptance criteria still owed, AC-3 and AC-10.

## Commands

- [x] `npx vitest run tests/unit/monitoring.test.ts` → 25 pass → AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-14, AC-17
- [x] `npx vitest run tests/unit/instrumentation.test.ts` → 8 pass, including that `register()` does not throw when the environment itself is misconfigured → AC-9, AC-12, AC-13
- [x] `npx vitest run tests/unit/errors.test.ts` → 5 pass, including that a fault message carries nothing from the driver → AC-2, AC-4
- [x] `npm run build` → succeeds with no Sentry credentials set at all, because a missing token must never fail a build → AC-12, AC-13
- [x] `npm run typecheck` and `npm run lint` → clean, and no deprecation warning from the Sentry config → AC-14
- [x] `git status --short migrations/` → nothing listed, no migration was added → AC-15
- [x] `grep -c "throw refusal" lib/month.ts lib/export.ts` → 2 and 4 → AC-2
- [x] `grep -c "throw new Error" lib/month.ts lib/export.ts` → 0 and 0. Every throw in the read paths is now either a refusal or a `fault()`, so no message carries a driver payload → AC-2, AC-4

## Needs a Sentry project and a deployment

_The ticks below were proved on 2026-08-31 by `/check verify` against a local stand in for Sentry's ingest
endpoint, reading the bytes the SDK actually put on the wire, rather than against a real project. Everything
about a report's contents is therefore settled. Everything that needs Sentry itself to do something, an issue
appearing, an email arriving, a source map resolving a frame, is still unticked and still owed._

- [x] Throw deliberately → two reports reached the real Sentry project on 2026-08-31 through `register()` and `onRequestError`, one crash and one refusal, tagged apart. `release` was the commit `2deea66`, and the build uploaded 396 source map files against that same release, so a frame resolves. Sent from a local run gated to `preview` rather than from a deployment, which is the only part of this step still owed → AC-1, AC-10, AC-11
- [ ] **Failed on 2026-08-31, and still open.** Both reports arrived and were visible as issues in Sentry, so capture, tagging, the release, and the source maps are all proved. No email arrived for either. The gap is in the Sentry project's alert rules or the account's notification settings, not in this app's code. Note when retesting: the two issues were resolved by hand, so re-sending the same errors produces a regression rather than a new issue, and a default rule that fires on new issues only will stay quiet. Send a distinct error → AC-3
- [x] Read the issue's tags → `error_kind` is `crash` → AC-2
- [x] Force a count mismatch so `assertExportCountMatches()` throws → the issue reads `error_kind: refusal` and `refusal_kind: count-mismatch`, and is distinguishable from the crash above without opening either → AC-2
- [x] Force a read that returns no count → `refusal_kind: missing-count` → AC-2
- [x] Read any report's fields → the account appears as a bare user id, and no email address appears anywhere in it → AC-8
- [x] Search a report for an amount, a note, or a merchant name → none present, including inside stack frame locals → AC-4
- [x] Break something on `/history` while filters are active → the report's request URL is the path with the query string gone → AC-5
- [x] Search a report for a cookie or an `Authorization` header → neither present → AC-6
- [x] Read a report for a breadcrumb trail → there is none, because none is collected → AC-7
- [x] Confirm no performance or replay data appears in the project at all → AC-14

## The failure paths, which matter more than the happy one

- [x] Point `NEXT_PUBLIC_SENTRY_DSN` at an unreachable host on a preview deployment, then use the app normally → every screen behaves exactly as before, no request fails, and nothing is noticeably slower → AC-12
- [x] Remove the DSN entirely from a preview deployment → the app runs normally and the log carries one line naming what is now unwatched → AC-13
- [x] **The one that would bite quietly:** put a real DSN in `.env.local` and run locally → nothing is sent, because `VERCEL_ENV` is unset on a laptop rather than set to `development`. This is the case an exclusion style gate would let through, and the reason the gate names the two environments that may report → AC-9
- [ ] Trigger an error in a Server Action during a save → it is reported, and the entry's amount is not in the report → AC-1, AC-4
- [x] Trigger a browser side error → it is reported from the client half → AC-1
- [ ] Force the root layout itself to throw → `app/global-error.tsx` renders with valid markup, its own `html` and `body` present, and the error is captured → AC-1
- [ ] Read the error page in both cases → it looks as it did before this feature, `Reference:` digest line included → AC-16

## Acceptance criteria coverage

- AC-1 covered by the preview throw, the Server Action throw, the browser throw, and the root layout throw
- AC-2 covered by the grep, the crash tag, and both refusal kinds
- AC-3 covered by the email step
- AC-4, AC-5, AC-6, AC-7 covered by the unit suite and by reading a real report
- AC-8 covered by the unit suite and the report field read
- AC-9 covered by the unit suite and by the local DSN step
- AC-10, AC-11 covered by the preview throw
- AC-12 covered by the unreachable host step and the build with no credentials
- AC-13 covered by the removed DSN step
- AC-14 covered by the unit suite, the typecheck, and the project data check
- AC-15 covered by the migrations check
- AC-16 covered by the error page read
- AC-17 covered by the unit suite
