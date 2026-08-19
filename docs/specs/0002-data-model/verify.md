# Verify: data model · spec 0002 · updated 2026-08-19 (verified by `/check verify`)

_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Every ticked step below was exercised against the live database during a
`/check verify` run, not inferred from the code or from a green suite. The one
unticked step says why it was not run.

## Commands

- [x] `npm test` → 42 pass, no network touched → AC-6, AC-9
- [x] `npm run typecheck` → clean; types come from `z.infer`, never declared twice → AC-9
- [x] `npm run test:integration` → 24 pass → AC-2, AC-3, AC-5, AC-6, AC-7, AC-10
- [x] `npx @insforge/cli db tables` → `profiles`, `categories`, `transactions` → AC-1
- [x] `npx @insforge/cli db migrations list` → both migrations applied → AC-1

## Database, provable without a session

- [x] Every money column is `bigint`, none is `numeric`, `real`, or `double precision`:
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='transactions' AND column_name LIKE '%amount%'` → `bigint` → AC-2 _(verified)_
- [x] `occurred_on` has no column default, so a caller must always supply the day:
      `SELECT column_default FROM information_schema.columns WHERE table_name='transactions' AND column_name='occurred_on'` → empty → AC-11 _(verified)_
- [x] `user_id` defaults to `auth.uid()` on both `categories` and `transactions` → AC-7 _(verified)_
- [x] All three tables have `relrowsecurity = true` and `relforcerowsecurity = false`, and `handle_new_user` is `SECURITY DEFINER` owned by the same role that owns the tables. If force is ever `true`, signup breaks silently → AC-4, AC-7 _(verified)_
- [x] Sum a set of awkward amounts in SQL and compare to the exact expected cents → AC-2 _(verified: 8 spends totalled 1000100039 exactly, `sum` returns `numeric`)_

## Behaviour

- [x] Sign up a brand new account → it gets one profile row and exactly ten categories, nine spend and one income, with the colours in the spec, and no application code ran → AC-4 _(verified)_
- [x] Log a spend and an income against matching categories, read both back → values identical to what was written → AC-1 _(verified)_
- [x] Try to log a spend against another account's category → refused by the database → AC-3 _(verified)_
- [x] Try to log a spend against `Salary`, an income category → refused → AC-3 _(verified)_
- [x] Delete a category that has transactions → refused; hide it instead → succeeds, and every transaction still reports under its name → AC-5 _(verified)_
- [x] Insert an amount of `0` and of `-500` → both refused → AC-6 _(verified)_
- [x] Add a category named `groceries` next to `Groceries` → refused; add `Groceries` as an *income* category → succeeds → AC-6 _(verified)_
- [x] Insert a 61 character category name, a 201 character merchant, a 501 character note, a 101 character display name, and a hex colour → each refused → AC-6 _(verified)_
- [x] Sign in as a second account and try to read, edit, and delete the first account's transaction → read returns empty, edit and delete affect nothing, and the second account never learns the row exists → AC-7 _(proven, `row-level-security.test.ts`)_
- [x] Delete an account → its profile, categories, and transactions all go, no orphans, and the restrict foreign key does not block it → AC-8 _(verified)_
- [x] Rename a column in a migration without updating `lib/schema.ts` → the drift test fails rather than a screen showing `NaN` → AC-10 _(proven, and the test was mutation checked: adding a column the database lacks makes it fail)_

## Value sourcing, one per row of the spec's table

These are the checks that catch a value taken from the wrong place, which the
design time gate cannot see.

- [x] `user_id` on insert: send a row with no `user_id` → the database fills it with your id. Send one naming another account's id → refused. The app must never be the source → AC-7
- [x] `occurred_on`: set `APP_TIMEZONE` to `Pacific/Kiritimati`, then to `Pacific/Niue`, and log an entry near midnight in each → the stored day follows `APP_TIMEZONE`, not the server clock and not the browser → AC-11
- [x] `created_at` and `updated_at`: edit an entry → `updated_at` moves, `created_at` does not. These are machine timestamps, so `APP_TIMEZONE` must not affect them → AC-1
- [x] `color` on a new category: omit it → defaults to `slate`. Send a token outside the ten → refused → AC-6
- [x] `display_name`: sign up with a name in the signup payload and again without one → present in the first profile, absent rather than empty string in the second → AC-4
- [ ] The ten starting categories: their names and colours come from the seed migration and nowhere else. Change one in the migration, sign up a new account → the new value appears; existing accounts are untouched → AC-4 _(NOT RUN: the
  source half is verified, two fresh signups produced exactly the ten names and
  colours the migration lists. The change and observe half needs editing an
  applied migration, which is destructive; do it on a backend branch)_
- [x] Category ordering for a picker: the query asks for `order=name.asc` with hidden ones filtered out. There is no stored sort column, so a client that forgets the order gets database order → AC-5
- [x] A month range: `currentMonthRange()` is half open, so an entry dated the first of the next month is excluded and one dated the first of this month is included → AC-1
- [x] A displayed amount: set `APP_CURRENCY` to `INR` then `USD` → `formatCents` follows it, and nothing outside `lib/money.ts` divides an amount → AC-2
- [x] A month total read back through the SDK: confirm it parses when Postgres returns `sum(bigint)` as a `numeric` **string** rather than a JSON number → AC-2

## Acceptance-criteria coverage

All twelve met, each with observed evidence from the verify run.

- AC-1 spend and income stored exactly · 8 spends and 1 income coexisted, kept apart by `direction`
- AC-2 integer cents, no float columns, exact SUM · `amount_cents` is `bigint`, no `numeric`/`real`/`double precision` column exists in any of the three tables, 8 awkward amounts totalled 1000100039 exactly
- AC-3 category must be yours and the kind must match · refused in `row-level-security.test.ts` and `constraints.test.ts`
- AC-4 new account gets a profile and ten categories · two fresh signups each produced 1 profile and 10 categories, 9 spend and 1 income, `Salary/emerald`
- AC-5 category with history cannot be deleted, hiding works · `constraints.test.ts`
- AC-6 write time constraints · `constraints.test.ts` plus direct writes refused by `categories_name_check` and `profiles_display_name_check`
- AC-7 row level security across two accounts · 9 integration tests; `relrowsecurity=true`, `relforcerowsecurity=false`, `user_id` defaults to `auth.uid()`
- AC-8 account delete cascades · 2 users, 2 profiles, 20 categories, 9 transactions deleted, zero orphans
- AC-9 Zod schemas and inferred types · 42 unit tests, typecheck clean
- AC-10 drift test against the live schema · mutation checked in this run: a column the database lacks made 3 drift tests fail
- AC-11 `occurred_on` has no default · `column_default` is empty in `information_schema`
- AC-12 forward fit documented · all five release rows present in `docs/migrations.md`
