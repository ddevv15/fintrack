# Verify: Error monitoring · spec 0011 · updated 2026-08-31

_Steps derived from spec 0011 acceptance criteria and every row of its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Most of this file cannot be run yet. The code is built and its pure half is proved, but everything about reports actually arriving needs a Sentry project and a deployment, neither of which exists at the time of writing. That is the honest state, not an oversight.

## Commands

- [x] `npx vitest run tests/unit/monitoring.test.ts` → 22 pass → AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-14, AC-17
- [x] `npm run build` → succeeds with no Sentry credentials set at all, because a missing token must never fail a build → AC-12, AC-13
- [x] `npm run typecheck` and `npm run lint` → clean, and no deprecation warning from the Sentry config → AC-14
- [x] `git status --short migrations/` → nothing listed, no migration was added → AC-15
- [x] `grep -c "throw refusal" lib/month.ts lib/export.ts` → 2 and 4, and the only remaining `throw new Error` in each is the read failure, which is a fault rather than a refusal → AC-2

## Needs a Sentry project and a deployment

- [ ] Throw deliberately on a preview deployment → an issue appears, its stack trace names a real file and line rather than a bundle position, and it carries the commit → AC-1, AC-10, AC-11
- [ ] Check the email → one arrives for the new issue, and a second occurrence of the same issue does not send another → AC-3
- [ ] Read the issue's tags → `error_kind` is `crash` → AC-2
- [ ] Force a count mismatch so `assertExportCountMatches()` throws → the issue reads `error_kind: refusal` and `refusal_kind: count-mismatch`, and is distinguishable from the crash above without opening either → AC-2
- [ ] Force a read that returns no count → `refusal_kind: missing-count` → AC-2
- [ ] Read any report's fields → the account appears as a bare user id, and no email address appears anywhere in it → AC-8
- [ ] Search a report for an amount, a note, or a merchant name → none present, including inside stack frame locals → AC-4
- [ ] Break something on `/history` while filters are active → the report's request URL is the path with the query string gone → AC-5
- [ ] Search a report for a cookie or an `Authorization` header → neither present → AC-6
- [ ] Read a report for a breadcrumb trail → there is none, because none is collected → AC-7
- [ ] Confirm no performance or replay data appears in the project at all → AC-14

## The failure paths, which matter more than the happy one

- [ ] Point `NEXT_PUBLIC_SENTRY_DSN` at an unreachable host on a preview deployment, then use the app normally → every screen behaves exactly as before, no request fails, and nothing is noticeably slower → AC-12
- [ ] Remove the DSN entirely from a preview deployment → the app runs normally and the log carries one line naming what is now unwatched → AC-13
- [ ] **The one that would bite quietly:** put a real DSN in `.env.local` and run locally → nothing is sent, because `VERCEL_ENV` is unset on a laptop rather than set to `development`. This is the case an exclusion style gate would let through, and the reason the gate names the two environments that may report → AC-9
- [ ] Trigger an error in a Server Action during a save → it is reported, and the entry's amount is not in the report → AC-1, AC-4
- [ ] Trigger a browser side error → it is reported from the client half → AC-1
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
