# 0002. Model spending as three owner scoped tables with integer cents

**Date**: 2026-08-19
**Status**: In Progress

## Summary

FinTrack stores everything in three Postgres tables: a `profiles` row for you, `categories` you can name and colour, and `transactions` that hold every spend and every income. Money is a whole number of cents in a `bigint` column, so a total can never drift the way a decimal number quietly does. The database itself refuses the mistakes that matter: an amount of zero, a category that is not yours, a grocery run filed under Salary, or deleting a category that still has history. The app reaches those tables through Zod schemas (a small library that checks a value's shape at runtime), so a renamed column becomes a loud error instead of a wrong number on screen.

## Requirements

**User stories**:

- As the person using FinTrack, I want every spend and every income stored exactly, so a month total is the real number and not something close to it.
- As the person using FinTrack, I want my entries filed under categories I control, so the breakdown matches how I actually think about money.
- As the person using FinTrack, I want my data readable only by me, enforced by the database rather than by app code remembering to check.
- As the person maintaining FinTrack, I want a schema the later releases extend rather than replace, so budgets, repeating bills, and several accounts do not force a rewrite.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: A signed in account can store a spend and an income, each carrying a positive whole cents amount, a category, and a calendar date, and reading them back returns exactly the values written.
- **AC-2**: Every money column is `bigint` holding whole cents. No column holding money is `numeric`, `real`, or `double precision`, and a Postgres `SUM` over a set of amounts returns the exact total.
- **AC-3**: A transaction may only reference a category that belongs to the same account and whose `kind` equals the transaction's `direction`. A write naming another account's category, or a category of the wrong kind, is refused by the database, not by app code.
- **AC-4**: Creating a new account produces its `profiles` row and its ten starting categories with no application code running, purely from the database trigger.
- **AC-5**: A category that still has transactions cannot be deleted; the delete is refused. Marking it hidden removes it from selection while every past transaction keeps pointing at it and still reports under its name.
- **AC-6**: The database refuses at write time: an amount of zero or below, a second category name for the same account and kind differing only in letter case, a category name over 60 characters, a merchant over 200, a note over 500, and a display name over 100.
- **AC-7**: A signed in account can select, insert, update, and delete only its own `profiles`, `categories`, and `transactions` rows. Every attempt against another account's row returns nothing or is refused, proven by an automated test that signs in as two real accounts.
- **AC-8**: Deleting an account removes its profile, its categories, and its transactions, leaving no orphaned row.
- **AC-9**: Every table has a Zod schema, TypeScript types are inferred from those schemas rather than written a second time, and a row that fails its schema raises an explicit error instead of reaching a screen as `undefined`.
- **AC-10**: An automated test reads a real row from each table and fails when a schema no longer matches the live database.
- **AC-11**: `occurred_on` carries no database default, so a calendar day must always be supplied by the caller, and `today()` in `lib/time.ts` is the only source of "today".
- **AC-12**: Adding a several accounts link, a budget, or a recurring rule is an additive migration: no column in this schema needs dropping, retyping, or a relaxed constraint. The exact additive change for each is written down in this spec.

## Decision

**Chosen option**: Option 1: three owner scoped tables, one `transactions` table with a shared direction enum.

FinTrack stores `profiles`, `categories`, and `transactions` in `public`, each row owned by an InsForge auth user id filled in by the database, with money as `bigint` cents, spend and income separated by a `direction` enum shared with the category `kind`, and correctness enforced by Postgres constraints and row level security rather than by application code.

**Implementation skills**: `insforge` (`InsForge`, `~/.agents/skills/insforge/`) · `insforge-cli` (`InsForge`, `~/.agents/skills/insforge-cli/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

The full decision record, meaning the problem, the models weighed against each other, the reasoning, and the calls made without asking, lives in [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

Shared type `entry_direction`, a Postgres enum with values `spend` and `income`. One type used by both tables, which is what makes the kind matching foreign key possible at all.

`public.profiles`

| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `uuid` | no | primary key, `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `display_name` | `text` | yes | copied from `auth.users.profile ->> 'name'` by the trigger, absent for a plain email signup. `CHECK (char_length(display_name) <= 100)` |
| `created_at` | `timestamptz` | no | `DEFAULT now()` |

`public.categories`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | primary key, `DEFAULT gen_random_uuid()` |
| `user_id` | `uuid` | no | `DEFAULT auth.uid()`, `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `name` | `text` | no | `CHECK (char_length(name) BETWEEN 1 AND 60)` |
| `kind` | `entry_direction` | no | spend or income |
| `color` | `text` | no | `DEFAULT 'slate'`, `CHECK (color IN ('green','orange','blue','purple','yellow','red','pink','teal','slate','emerald'))` |
| `is_hidden` | `boolean` | no | `DEFAULT false` |
| `created_at` | `timestamptz` | no | `DEFAULT now()` |
| `updated_at` | `timestamptz` | no | `DEFAULT now()`, maintained by `set_updated_at()` |

- `CREATE UNIQUE INDEX categories_owner_kind_name_key ON categories (user_id, kind, lower(name));` so Groceries and groceries cannot both exist, while a spend Gifts and an income Gifts can. This must be a unique **index**, not a table constraint: a `UNIQUE (...)` constraint cannot call a function such as `lower()`.
- `ALTER TABLE categories ADD CONSTRAINT categories_owner_id_kind_key UNIQUE (user_id, id, kind);` This must be a real **constraint**, not a bare index, because it is what the transactions foreign key below references. It is redundant against the primary key and that is fine.

`public.transactions`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | primary key, `DEFAULT gen_random_uuid()` |
| `user_id` | `uuid` | no | `DEFAULT auth.uid()`, `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `category_id` | `uuid` | no | part of the composite foreign key |
| `direction` | `entry_direction` | no | part of the composite foreign key |
| `amount_cents` | `bigint` | no | `CHECK (amount_cents > 0)` |
| `occurred_on` | `date` | no | no default; the server supplies it from `APP_TIMEZONE` |
| `merchant` | `text` | yes | `CHECK (char_length(merchant) <= 200)` |
| `note` | `text` | yes | `CHECK (char_length(note) <= 500)` |
| `created_at` | `timestamptz` | no | `DEFAULT now()`, feature 7's newest first tiebreak |
| `updated_at` | `timestamptz` | no | `DEFAULT now()`, maintained by `set_updated_at()` |

- `FOREIGN KEY (user_id, category_id, direction) REFERENCES categories (user_id, id, kind) ON DELETE RESTRICT ON UPDATE RESTRICT`. Three columns, not two: a two column key would confirm the category exists with that kind but not that it is yours, which would let one account file entries against another account's category id and probe which ids exist. Including `user_id` closes both.
- Index `(user_id, occurred_on DESC, created_at DESC)` for feature 7's month list and every month total.
- Index `(user_id, category_id)` for feature 8's breakdown and feature 9's rename safety.

**Relationships**: `auth.users` 1 to 1 `profiles` (cascade). `auth.users` 1 to many `categories` and 1 to many `transactions` (cascade). `categories` 1 to many `transactions` (restrict).

**State transitions**: a transaction has no lifecycle; it exists, it is edited, it is deleted. A category has one: `visible` to `hidden` via `is_hidden`, reversible at any time, triggered only by you. Hiding never touches the transactions pointing at it, which is what makes it the safe substitute for deleting.

**Forward fit** (the additive change each later release needs, satisfying AC-12):

| Later release | Additive change | Touches this schema? |
|---|---|---|
| 13, budgets per category | new `budgets` table with `(user_id, category_id, month, limit_cents)` | no |
| 15, recurring bills | new `recurring_rules` table plus a nullable `transactions.recurring_rule_id` | one new nullable column |
| 17, accounts and balances | new `accounts` table plus a nullable `transactions.account_id`, backfilled to a single default account | one new nullable column |
| 18, receipt photos | nullable `transactions.receipt_path` pointing at InsForge Storage | one new nullable column |
| 19, bank connection | new `bank_transactions` staging table plus a nullable `transactions.external_id` with a unique index for duplicate catching | one new nullable column |

No column here is dropped, retyped, or has a constraint relaxed by any of them.

**API surface**: this feature adds no HTTP endpoints and no SQL functions. The surface is the three tables reached through `@insforge/sdk`, which is PostgREST underneath, so the errors below are Postgres SQLSTATE codes surfaced by the SDK.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `profiles` | select | none | `user_id`, `display_name` | signed in, own row | empty result if not signed in |
| `profiles` | update | `display_name:text` | the row | signed in, own row | `42501` policy denied |
| `categories` | select | filters: `kind`, `is_hidden`; order `name.asc` | `id`, `name`, `kind`, `color`, `is_hidden` | signed in, own rows | empty result, never another account's rows |
| `categories` | insert | `name:text` (req), `kind:entry_direction` (req), `color:text` (opt) | the row | signed in | `23505` duplicate name for that kind, `23514` name length or unknown colour |
| `categories` | update | `id` plus changed fields | the row | signed in, own rows | `23505` duplicate name, `23503` kind change blocked while transactions exist |
| `categories` | delete | `id` | none | signed in, own rows | `23503` restrict, the category still has transactions |
| `transactions` | select | filters: `occurred_on` range (half open), `category_id`, `direction` | the rows | signed in, own rows | empty result, never another account's rows |
| `transactions` | insert | `category_id:uuid` (req), `direction:entry_direction` (req), `amount_cents:bigint` (req), `occurred_on:date` (req), `merchant:text` (opt), `note:text` (opt) | the row | signed in | `23503` category not yours or wrong kind, `23514` amount not above zero or text too long |
| `transactions` | update | `id` plus changed fields | the row | signed in, own rows | same as insert |
| `transactions` | delete | `id` | none | signed in, own rows | `42501` policy denied |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| insert any row | `user_id` | database `DEFAULT auth.uid()`; the app never sends it, and the insert policy still checks it |
| insert any row | `id` | database `DEFAULT gen_random_uuid()` |
| insert a transaction | `occurred_on` | supplied by the caller as a `PlainDate`; "today" comes only from `today()` in `lib/time.ts`, which reads `APP_TIMEZONE`. The column deliberately has no default so no server clock can leak in |
| insert a transaction | `direction` | the caller, and it must equal the chosen category's `kind`, enforced by the composite foreign key rather than trusted |
| insert a transaction | `amount_cents` | the caller, already whole cents. Turning what you type into cents belongs to feature 6, as the comment in `lib/money.ts` records |
| insert or update any row | `created_at`, `updated_at` | `now()` and the `set_updated_at()` trigger. These are machine timestamps, not calendar days, so `APP_TIMEZONE` does not apply |
| insert a category | `color` | the caller picks a token from the fixed list of ten, defaulting to `slate`. Feature 4 maps a token to actual colour values for light and dark |
| new account | `profiles.display_name` | `NEW.profile ->> 'name'` inside the trigger, which is absent for a plain email signup, which is why the column is nullable |
| new account | the ten starting categories, their names, kinds, and colours | the `seed_new_user` migration in this spec, and nowhere else |
| read the category picker | the order categories appear in | the query, `order=name.asc` with `is_hidden` filtered out. There is no stored sort order column; feature 9 may add one as a nullable integer |
| any read | which rows come back | row level security, `user_id = (SELECT auth.uid())`, not an app side filter |
| a month query | the month's start and end | `currentMonthRange()` in `lib/time.ts`, half open, derived from `APP_TIMEZONE` |
| display an amount | the formatted money string | `formatCents()` in `lib/money.ts`, currency from `APP_CURRENCY` |

**Key invariants**:

1. `amount_cents` is always a whole number of cents strictly greater than zero. Direction carries the sign, never the number.
2. A transaction's category belongs to the same account and its `kind` equals the transaction's `direction`. Enforced by the three column foreign key, so no write path can go around it.
3. A category **that has transactions** cannot be deleted, and its `kind` cannot change while they exist. Both come from the same `ON DELETE RESTRICT ON UPDATE RESTRICT`, so a category with no history may still be renamed, recoloured, or switched between spend and income freely.
4. Category names are unique per account per kind, compared without regard to letter case.
5. Every row's `user_id` equals the signed in user id, on read and on write, enforced by policy rather than by query.
6. Every table holding personal data has row level security enabled with a policy for each of select, insert, update, and delete. A table without all four is a leak.
7. `occurred_on` is a calendar day with no time and no zone. Only `lib/time.ts` decides what today is.
8. No row reaches a screen without passing its Zod schema. A failed parse throws, per rule 11 of spec 0001, and never falls back to a zero or a partial total.

**Security model**:

Every table has row level security enabled with four policies, granted `TO authenticated`, each using `user_id = (SELECT auth.uid())` in `USING` and, for insert and update, in `WITH CHECK` as well. The `(SELECT ...)` wrapping is deliberate: Postgres then evaluates the call once for the statement rather than once per row. `profiles` gets select and update only, because the trigger creates the row and the cascade removes it, so there is no legitimate user insert or delete.

One function runs as `SECURITY DEFINER`, which spec 0001 rule 7 restricts. `handle_new_user()` must, and the reason is worth writing down exactly, because it is load bearing and easy to break later.

During the `AFTER INSERT ON auth.users` trigger there is no signed in user yet, so `auth.uid()` returns null. Two separate things follow from that. First, the function cannot rely on the `DEFAULT auth.uid()` on `profiles.user_id` or on `categories.user_id`; it must write `NEW.id` explicitly into **every** row it inserts, the profile and all ten categories, or each insert violates `NOT NULL`. Second, the insert policies check `user_id = (SELECT auth.uid())`, which is null at that moment and would reject every one of those rows. What saves it is that a Postgres table owner is exempt from that table's own row level security unless `FORCE ROW LEVEL SECURITY` is set on the table. `SECURITY DEFINER` makes the function run as its owner, so provided the function is owned by the role that owns the three tables, the policies never apply to it.

Two conditions therefore have to hold, and the migration must state both in a comment: `handle_new_user()` is owned by the same role that owns `profiles` and `categories`, and none of the three tables ever has `FORCE ROW LEVEL SECURITY` enabled. Turning that on later breaks account creation silently, which is why build plan step 4 confirms a fresh signup really produced a profile and ten categories rather than assuming it.

`set_updated_at()` is a plain `BEFORE UPDATE` trigger and stays `SECURITY INVOKER`. No views over personal data are created by this feature, so the `security_invoker` view trap does not arise yet.

Compliance scope: personal financial data belonging to a single person, self hosted on your own InsForge project. No card data, no bank credentials, and no third party is given access, so no payment or open banking regime applies at this feature. That changes at feature 19, and its spec owns it.

**Configuration required**:

- `INSFORGE_TEST_URL`: the URL of a non production InsForge branch that the integration tests run against. Spec 0001 rule 8 already forbids a preview pointing at production; this is where that branch actually gets created.
- `INSFORGE_TEST_ANON_KEY`: the anon key for that branch.
- `INSFORGE_TEST_EMAIL_A`, `INSFORGE_TEST_PASSWORD_A`, `INSFORGE_TEST_EMAIL_B`, `INSFORGE_TEST_PASSWORD_B`: the two accounts the row level security test signs in as. Test only, never a real account, and never committed.

These are test only and belong in `lib/env.ts` as a separate, optional schema parsed by the integration test setup, not in the required app schema, so `npm run dev` never demands them.

**Critical test scenarios**:

- Happy path: a signed in account inserts one spend and one income against matching categories, reads both back, and Postgres sums them to the exact expected cents, verifies **AC-1**, **AC-2**.
- Failure case: an insert naming a category belonging to the other test account is refused, and an insert whose `direction` disagrees with the category's `kind` is refused, verifies **AC-3**.
- Failure case: deleting a category that has one transaction is refused with `23503`, and hiding it instead succeeds with the transaction still readable under that category's name, verifies **AC-5**.
- Failure case: inserting a zero amount, a negative amount, a duplicate category name differing only in case, and a note of 501 characters are each refused, verifies **AC-6**.
- Failure case: a Zod schema missing a column that the live table has, or holding one it no longer has, fails the drift test rather than passing silently, verifies **AC-10**.
- Auth/permission: account B selects, updates, and deletes account A's transaction. Select returns an empty result; update and delete affect zero rows. At no point does B learn the row exists, verifies **AC-7**.
- Cleanup: deleting a test account leaves no `profiles`, `categories`, or `transactions` row behind, verifies **AC-8**.

## Build plan

> **Build progress** (updated by `/develop`, 2026-08-19). All thirteen boxes are done and all twelve acceptance criteria pass against the live database: 38 unit tests and 24 integration tests, including the two account row level security proof. Box 1 changed shape, with agreement: no separate backend branch was created, because the project was empty with zero users and the branch would have protected nothing. See Follow-up for that and for how the test accounts are provisioned.

Ordered by the project's Skateboard approach: the thinnest usable whole here is a database the app can read and write safely, so the schema, its policies, and the typed access path land together and everything after that grows it.

1. [x] Create a non production InsForge branch and two test accounts, add the six test only environment values to `.env.example` and an optional schema in `lib/env.ts`, and confirm `.env*.local` stays ignored. Prerequisite for **AC-7**, **AC-10**.
2. [x] Write migration `core-schema`: the `entry_direction` enum, the three tables with every column, check, unique index, and secondary index above, the three column composite foreign key, and the four row level security policies per table. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-11**.
3. [x] Write migration `seed-new-user`: `handle_new_user()` as `SECURITY DEFINER`, owned by the role that owns the tables, carrying the comment that records both conditions from the Security model above, plus the `AFTER INSERT ON auth.users` trigger and the profile insert reading `NEW.profile ->> 'name'` (the shape InsForge documents for its auth table). **Every insert in this function writes `NEW.id` into `user_id` literally, the profile row and all ten category rows alike**; relying on the `DEFAULT auth.uid()` here inserts null and fails, so no account could be created. The ten starting categories, with the colour token each one gets:

   | Name | Kind | Colour |
   |---|---|---|
   | Groceries | spend | `green` |
   | Eating out | spend | `orange` |
   | Transport | spend | `blue` |
   | Housing | spend | `purple` |
   | Utilities | spend | `yellow` |
   | Health | spend | `red` |
   | Shopping | spend | `pink` |
   | Entertainment | spend | `teal` |
   | Other | spend | `slate` |
   | Salary | income | `emerald` |

   Satisfies **AC-4**.
4. [x] Apply both migrations to the target project with `npx @insforge/cli db migrations up --all`, create the two test accounts, and confirm each received a profile and ten categories. Satisfies **AC-4**.
5. [x] Write `lib/schema.ts`: a Zod schema per table plus the `entry_direction` enum, insert and update variants where they differ from the row shape, and TypeScript types inferred with `z.infer` rather than declared a second time. Export one small helper that parses a result set and throws an explicit error naming the table and the failing field. Satisfies **AC-9**.
6. [x] Add `tests/unit/schema.test.ts`: pure checks with no network, covering that a valid row parses, a negative amount is rejected, an over length note is rejected, and an unknown colour token is rejected. Satisfies **AC-6**, **AC-9**.
7. [x] Add a second Vitest config `vitest.integration.config.mts` including `tests/integration/**/*.test.ts`, and a `test:integration` script, so the network dependent tests never run inside `npm test`. Carries **AC-7**, **AC-10**, which have no other place to run.
8. [x] Add `tests/integration/schema-drift.test.ts`: read one real row from each of the three tables on the test branch and assert its Zod schema parses it, failing when the live schema and the schema file disagree. Satisfies **AC-10**.
9. [x] Add `tests/integration/row-level-security.test.ts`: sign in as both test accounts and run the cross account select, insert, update, and delete attempts, plus the category restrict, kind mismatch, and constraint refusals. Satisfies **AC-3**, **AC-5**, **AC-6**, **AC-7**.
10. [x] Add a Postgres exactness check to the integration test: insert a set of awkward amounts, sum them in SQL, and assert the exact cents, so the money guarantee is tested and not merely declared. Satisfies **AC-2**.
11. [x] Extend the GitHub Actions workflow to run `test:integration` only where the test branch secrets are present, so a fork or a secretless run skips rather than fails. Keeps **AC-7**, **AC-10** enforced on every push rather than only locally.
12. [x] Update the migrations guide and the root `AGENTS.md` pointer with the forward fit table above, so the additive path for budgets, recurring bills, and accounts is written down where the next build will read it. Satisfies **AC-12**.
13. [x] Apply both migrations to the production InsForge project, before any feature 5 or feature 6 code is deployed, per spec 0001 rule 9. Satisfies **AC-1** through **AC-8** in production rather than only on the test branch.

## Consequences

**Positive**:

- The expensive mistakes are structurally impossible rather than carefully avoided. A wrong sign, a foreign category, a mismatched kind, and a deleted category with history are all refused by Postgres, so no future write path can reintroduce them.
- Feature 9's promise that entries still point at the right category after a rename is free: the link is by id, and the restrict rule means a category with history cannot vanish underneath its transactions.
- Spec 0001 rule 8 stops being a rule on paper. This feature actually creates the non production branch, which every later feature then inherits.
- The two open questions spec 0001 left for feature 3 are both closed here: how types reach the app, and what the starting categories are.
- The forward fit table converts "later releases fit without a breaking change" from an assertion into a named migration per release, checkable by reading it.

**Negative / tradeoffs**:

- Income is designed and enforced now, four releases before feature 14 builds a screen for it. The `direction` column, the category `kind`, and the three column foreign key all exist to serve a feature you cannot use yet, and they make every Release 1 insert carry a field with only one possible value.
- Zod schemas are hand maintained against SQL. The drift test catches disagreement, but only for tables that have at least one row, and only when the integration suite runs. A brand new nullable column on an empty table can still slip through.
- The integration tests need a live backend, two accounts, and secrets in CI. That is real setup for a solo project, and a test suite that cannot run offline is a test suite that gets skipped under pressure.
- The three column foreign key is unusual enough that a future reader will wonder why the plain two column version was not used. It needs a comment in the migration or it will be "simplified" into a hole.
- Account creation depends on a Postgres rule that is invisible in the schema: the table owner is exempt from its own row level security. Enabling `FORCE ROW LEVEL SECURITY` on any of the three tables, or letting the trigger function end up owned by a different role, breaks signup with no warning at migration time. The migration comment and the build plan check are the only things guarding it.
- Last write wins on edits was chosen deliberately, so an entry edited on the laptop and the phone within the same moment loses one edit with no warning. Acceptable for one person, and it is a silent data loss path that now exists on record.
- The `UNIQUE (user_id, id, kind)` constraint on categories is redundant against the primary key. Its real cost is index maintenance on category writes, which are rare, rather than extra work per transaction write, since the foreign key check uses this index in place of the primary key index it would otherwise use.

**Neutral**:

- Three tables is more than Release 1 strictly needs, since `profiles` holds a display name nothing reads yet. It is InsForge's own documented pattern and the home later settings will want.
- A Postgres enum rather than a text column with a check means adding a third direction later, for example a transfer once feature 17 lands, is `ALTER TYPE ... ADD VALUE` rather than editing a constraint. Both are easy; they are different commands to remember.
- Colours are stored as token names, not hex values, so this schema says nothing about what a category actually looks like. Feature 4 owns that mapping, and until it exists the tokens are just labels.
- A second Vitest config is a new pattern in this repo. It is the standard way to keep network tests out of the fast suite, and it is one more file to keep in step.

## Follow-up

- [ ] Feature 5, sign in, has no spec yet, and this entire model rests on `auth.uid()` and `auth.users` behaving as InsForge documents. Design feature 5 before or alongside the build, and revisit these policies if its session model differs from what is assumed here.
- [ ] Decide where the ten colour tokens map to real colours. Feature 4 owns it, and until that spec exists the token list in the migration is the only place they are named.
- [ ] The category colour list is fixed by a check constraint. If feature 9 wants a colour picker with more than ten options, that constraint is the thing to widen, and it is a migration.
- [ ] Consider whether the drift test should also assert the reverse direction, that the live table has no column the Zod schema is missing, which needs an `information_schema` query rather than parsing a row.
- [x] ~~Email verification is required but SMTP is off.~~ Resolved. SMTP now works through Resend and a real signup reaches it.
- [ ] **Resend will only deliver to your own address until a domain is verified.** The shared `onboarding@resend.dev` sender refuses every other recipient with a 550. For a one person app that is survivable, since you are the only real user, but feature 5 should decide whether to verify a domain or drop the verification requirement.
- [ ] **The two test accounts were verified by setting `auth.users.email_verified` directly**, because they live at unroutable `.invalid` addresses and no email can reach them. That is a row level data fix on two throwaway rows, not a schema change, and it is how they get recreated if they are ever deleted. Documented in `docs/migrations.md`.
- [ ] **No separate backend branch was created.** Spec 0002 and spec 0001 rule 8 both call for one; the project was empty with zero users, so it would have protected nothing. Revisit before feature 6 puts real transactions in, because after that a test run against the live project is writing into real history.
- [ ] **Test accounts are not self provisioning.** The spec's six test environment values became three (`INSFORGE_TEST_EMAIL_A`, `INSFORGE_TEST_EMAIL_B`, `INSFORGE_TEST_PASSWORD`), reusing the existing URL and key. The accounts cannot be created by the suite because a test cannot read a verification email, so they are signed up and verified once by hand and reused.
- [ ] **`sum(bigint)` returns `numeric`, not `bigint`**, so a month total can arrive over the wire as a string. `centsSchema` in `lib/schema.ts` already handles that. Feature 8 should not assume a JSON number.
- [ ] **The root `AGENTS.md` pointer to the migrations guide is not written**, because `/develop` does not edit that file. `/sync` should add it, along with `docs/migrations.md` replacing the old `migrations/README.md` path.
- [ ] **The CI integration step is unverified.** It is written and the YAML parses, but nothing has pushed yet, and it stays skipped until the repository secrets exist.
- [ ] Spec 0001 follow up items about the PostHog MCP server, the Arcjet MCP server, and the `docs/.agent-cache/` folder are still open and untouched by this feature.
