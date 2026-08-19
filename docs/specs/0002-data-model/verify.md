# Verify: data model · spec 0002 · updated 2026-08-19

_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Several steps below are marked **proven by hand**: they were run against the live
database during the build, before the integration suite could sign in. They are
kept here because a hand run proves the schema today and proves nothing after
the next migration. Turning each into a rerunnable check is what unblocking the
integration suite buys you.

## Commands

- [ ] `npm test` → 38 pass, no network touched → AC-6, AC-9
- [ ] `npm run typecheck` → clean; types come from `z.infer`, never declared twice → AC-9
- [ ] `npm run test:integration` → the whole suite green → AC-2, AC-3, AC-5, AC-6, AC-7, AC-10
- [ ] `npx @insforge/cli db tables` → `profiles`, `categories`, `transactions` → AC-1
- [ ] `npx @insforge/cli db migrations list` → both migrations applied → AC-1

## Database, provable without a session

- [ ] Every money column is `bigint`, none is `numeric`, `real`, or `double precision`:
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='transactions' AND column_name LIKE '%amount%'` → `bigint` → AC-2 _(proven by hand)_
- [ ] `occurred_on` has no column default, so a caller must always supply the day:
      `SELECT column_default FROM information_schema.columns WHERE table_name='transactions' AND column_name='occurred_on'` → empty → AC-11 _(proven by hand)_
- [ ] `user_id` defaults to `auth.uid()` on both `categories` and `transactions` → AC-7 _(proven by hand)_
- [ ] All three tables have `relrowsecurity = true` and `relforcerowsecurity = false`, and `handle_new_user` is `SECURITY DEFINER` owned by the same role that owns the tables. If force is ever `true`, signup breaks silently → AC-4, AC-7 _(proven by hand)_
- [ ] Sum a set of awkward amounts in SQL and compare to the exact expected cents → AC-2 _(proven by hand: 9 rows totalled 1000104638 exactly)_

## Behaviour

- [ ] Sign up a brand new account → it gets one profile row and exactly ten categories, nine spend and one income, with the colours in the spec, and no application code ran → AC-4 _(proven by hand)_
- [ ] Log a spend and an income against matching categories, read both back → values identical to what was written → AC-1 _(proven by hand)_
- [ ] Try to log a spend against another account's category → refused by the database → AC-3 _(proven by hand)_
- [ ] Try to log a spend against `Salary`, an income category → refused → AC-3 _(proven by hand)_
- [ ] Delete a category that has transactions → refused; hide it instead → succeeds, and every transaction still reports under its name → AC-5 _(proven by hand)_
- [ ] Insert an amount of `0` and of `-500` → both refused → AC-6 _(proven by hand)_
- [ ] Add a category named `groceries` next to `Groceries` → refused; add `Groceries` as an *income* category → succeeds → AC-6 _(proven by hand)_
- [ ] Insert a 61 character category name, a 201 character merchant, a 501 character note, a 101 character display name, and a hex colour → each refused → AC-6 _(proven by hand)_
- [ ] Sign in as a second account and try to read, edit, and delete the first account's transaction → read returns empty, edit and delete affect nothing, and the second account never learns the row exists → **AC-7, not yet proven, needs the test accounts**
- [ ] Delete an account → its profile, categories, and transactions all go, no orphans, and the restrict foreign key does not block it → AC-8 _(proven by hand)_
- [ ] Rename a column in a migration without updating `lib/schema.ts` → the drift test fails rather than a screen showing `NaN` → **AC-10, not yet proven, needs the test accounts**

## Value sourcing, one per row of the spec's table

These are the checks that catch a value taken from the wrong place, which the
design time gate cannot see.

- [ ] `user_id` on insert: send a row with no `user_id` → the database fills it with your id. Send one naming another account's id → refused. The app must never be the source → AC-7
- [ ] `occurred_on`: set `APP_TIMEZONE` to `Pacific/Kiritimati`, then to `Pacific/Niue`, and log an entry near midnight in each → the stored day follows `APP_TIMEZONE`, not the server clock and not the browser → AC-11
- [ ] `created_at` and `updated_at`: edit an entry → `updated_at` moves, `created_at` does not. These are machine timestamps, so `APP_TIMEZONE` must not affect them → AC-1
- [ ] `color` on a new category: omit it → defaults to `slate`. Send a token outside the ten → refused → AC-6
- [ ] `display_name`: sign up with a name in the signup payload and again without one → present in the first profile, absent rather than empty string in the second → AC-4
- [ ] The ten starting categories: their names and colours come from the seed migration and nowhere else. Change one in the migration, sign up a new account → the new value appears; existing accounts are untouched → AC-4
- [ ] Category ordering for a picker: the query asks for `order=name.asc` with hidden ones filtered out. There is no stored sort column, so a client that forgets the order gets database order → AC-5
- [ ] A month range: `currentMonthRange()` is half open, so an entry dated the first of the next month is excluded and one dated the first of this month is included → AC-1
- [ ] A displayed amount: set `APP_CURRENCY` to `INR` then `USD` → `formatCents` follows it, and nothing outside `lib/money.ts` divides an amount → AC-2
- [ ] A month total read back through the SDK: confirm it parses when Postgres returns `sum(bigint)` as a `numeric` **string** rather than a JSON number → AC-2

## Acceptance-criteria coverage

- AC-1 spend and income stored exactly · covered, proven by hand
- AC-2 integer cents, no float columns, exact SUM · covered, proven by hand and by the unrun integration test
- AC-3 category must be yours and the kind must match · covered, proven by hand
- AC-4 new account gets a profile and ten categories · covered, proven by hand
- AC-5 category with history cannot be deleted, hiding works · covered, proven by hand
- AC-6 write time constraints · covered, proven by hand and by 20 unit tests
- AC-7 row level security across two accounts · **not proven**, blocked on the test accounts
- AC-8 account delete cascades · covered, proven by hand
- AC-9 Zod schemas and inferred types · covered by unit tests and the typecheck
- AC-10 drift test against the live schema · **not proven**, test written but unrun
- AC-11 `occurred_on` has no default · covered, proven by hand
- AC-12 forward fit documented · covered by `docs/migrations.md`
