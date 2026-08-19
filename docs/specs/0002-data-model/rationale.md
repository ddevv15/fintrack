# 0002. Rationale

The decision record behind [index.md](index.md): the problem, the models weighed against each other, the reasoning, and the calls made without asking.

## Context

> ⚠️ Premise note: this model rests entirely on InsForge Auth, `auth.uid()`, and `auth.users` behaving as documented, and feature 5, sign in, has no spec yet. Every foreign key, every policy, and the new user trigger assume that shape. If feature 5 later chooses a different session model, or InsForge changes what a token carries, the security critical layer of this schema is what breaks, and it breaks quietly rather than loudly. The right framing is to treat InsForge Auth as a fixed constraint on this feature, stated here rather than assumed, and to design feature 5 before this schema reaches production. That assumption is recorded as a Follow-up item in the index.

FinTrack has a stack, a scaffold, and tooling, and nothing to put in them. Spec 0001 settled Postgres through InsForge with plain SQL migrations, no ORM, and money as integer cents, then explicitly deferred two questions to this feature: how column names and SQL function contracts reach TypeScript when nothing links the schema to the code, and what starting categories a new account actually receives. Neither can be left to the first build that needs them, because whichever feature guesses first sets the pattern for everything after it.

The forces are unusual for a data model. There is one person using this and one person maintaining it, so scale is not a force at all; a few thousand rows a year will never strain anything. What is a force is that a wrong money figure shown confidently is the failure this whole project exists to avoid, and that the release plan reaches five releases past this one. Budgets, repeating bills, several accounts, receipt photos, and a bank connection all land on these tables eventually, and the scope's own success condition for this feature is that they fit without a breaking change.

The second force is that there is no compile time link between the schema and the app. With no ORM, renaming a column breaks nothing until it runs, and what it produces at runtime is `undefined`, which becomes `NaN` in a total, which is a confident wrong number on the screen whose whole job is to be right. Every option here is partly an answer to that.

The third force is that row level security is the only thing standing between accounts, and a mistaken policy is a silent leak rather than a loud error. Spec 0001 named this and left it as work Release 1 would otherwise not have. It arrives here, because the policies arrive here.

The consequence of not deciding is concrete: feature 6 cannot save a spend without a table to save it to, a category to file it under, and a type to describe it. Every day this stays open is a day the first build invents an answer that then becomes the answer.

## Options considered

### Option 1: three owner scoped tables, one `transactions` table with a shared direction enum

`profiles`, `categories`, `transactions`. Money as positive `bigint` cents. Spend and income distinguished by a `direction` enum on the transaction, matched to a `kind` enum on the category through a composite foreign key that also carries the owner. Constraints, policies, and the new account seed all live in Postgres.

**Pros**:
- The sign of a number never carries meaning, so a sign error cannot silently convert a spend into income, and every query has to say out loud which direction it means.
- The composite foreign key makes filing a grocery run under Salary structurally impossible, and widening it to three columns closes the cross account hole in the same stroke.
- One table means one set of indexes, one set of policies, and one place feature 8's breakdown and feature 14's money in and money out both read from.
- Every later release in the forward fit table is a new table plus at most one nullable column.

**Cons**:
- Income machinery exists four releases before anything uses it, and every Release 1 insert carries a `direction` field with one possible value.
- The three column foreign key needs the redundant `UNIQUE (user_id, id, kind)` index to anchor it, and it is unusual enough that a future reader may "simplify" it back into a hole.
- `profiles` holds a display name nothing reads yet.

### Option 2: two tables and signed cents

`categories` and `transactions` only, foreign keyed straight to `auth.users(id)`. One `amount_cents` column where a spend is negative and income positive. No profile, no direction column, no kind matching.

**Pros**:
- The smallest thing that works, and genuinely enough for one person. The net for a month is a plain `SUM`, with nothing to remember.
- No redundant index, no composite key, no column serving a future release.
- Adding `profiles` later is one additive migration with exactly one row to backfill, because it is your app and you are the only account.

**Cons**:
- Every single query has to remember the sign convention, forever, including the ones written under time pressure two years from now. `SUM(amount_cents)` for "what did I spend" is wrong and looks right.
- Nothing stops a category being used in either direction, so a breakdown can contain a row that makes no sense and no layer objects.
- A missing `abs()` in one place shows a negative total on the screen that exists to show a total.

### Option 3: separate `spends` and `incomes` tables

Two structurally similar tables kept fully apart, each with its own policies, indexes, and categories relationship.

**Pros**:
- The clearest possible separation. A query against `spends` cannot accidentally include income, with no constraint needed to say so.
- Each table can diverge freely later, which matters if income grows fields spending never needs.

**Cons**:
- Every combined view becomes a `UNION`, including the one feature 14 is actually for, money in against money out.
- Every shared concern is written twice: policies, indexes, the `updated_at` trigger, the Zod schema, the drift test. Two of everything is two chances to make them disagree.
- Feature 10's search across your history, and feature 16's trends, both want one stream and would have to reassemble it every time.

### Option 4: a double entry ledger of accounts and postings

The accountant's model. An `accounts` table, and every transaction as a pair of balanced postings, debit and credit. Categories become accounts of an expense type.

**Pros**:
- Structurally correct in a way nothing else here is: every amount has a source and a destination, and the books balance by construction.
- Feature 17, accounts and balances, and any future transfer between accounts fall out of the model rather than being bolted on.
- The model the entire accounting profession converged on, for reasons that are load bearing at scale.

**Cons**:
- Every screen in Release 1 becomes a translation layer. Logging a coffee means writing two rows, and "how much did I spend on groceries" becomes a join and a sign convention rather than a filter.
- It is a considerable amount of concept for one person tracking a few hundred entries a year, and the concepts have to be held in your head every time you touch the schema.
- It answers feature 17 four releases early, at the cost of making features 6, 7, and 8 harder, which are the ones you would actually use every day.

## Rationale

Option 1 is chosen because the forces here are correctness and a five release horizon, not scale or speed, and it is the option that spends its complexity on exactly those two things.

The correctness force settles the direction question. Spec 0001's stated failure mode is a wrong money figure shown confidently, and a sign convention is a wrong money figure waiting for one forgotten `abs()`. Option 2 is genuinely lighter and would work today, but it moves a rule that Postgres could enforce into every query a human writes, which is precisely the trade this project has already decided against twice, at integer cents and at row level security. The same reasoning drives the composite foreign key: the alternative was a form that only offers matching categories, which is a rule enforced by the layer most likely to be bypassed.

The horizon force settles the shape. The scope's success condition for this feature names budgets, repeating bills, and several accounts explicitly, so the model had to be checked against them rather than assumed to fit. It does, as one new table each plus at most one nullable column, and that is written into the index as a table rather than claimed. Option 4 would fit those releases even better, and it was seriously weighed. It loses because it makes features 6, 7, and 8 materially harder, and those are the ones that decide whether this app gets used at all. A model that is more correct about accounting and worse at logging a coffee is the wrong trade for a tracker one person opens daily.

The engineer asked for the profile table on scalability grounds after I gave a reason that turned out to be wrong: `auth.users` is directly foreign key referenceable in InsForge, so referential integrity was never the argument. They kept it on the corrected facts, and it stands on the weaker but real ground that it is InsForge's own documented pattern and the obvious home for later per person settings. It is honestly the least load bearing thing in this spec.

On types, the engineer originally picked generation with Zod for function contracts, conditional on my confirming the InsForge CLI could generate. It cannot; the platform's own guidance is to inspect the schema and hand write the interface. Asked for the most efficient path on the corrected facts, the answer is Zod schemas with types inferred from them, plus a drift test. Zod is already installed and already the pattern in `lib/env.ts`, inference means the shape is written once rather than twice, and building a generator would be a comparable amount of code that the project would then own forever for three tables. The drift test is the part that earns its keep: it converts the one failure this stack cannot otherwise catch into a red CI run.

## Calls made without asking

Each of these was decided here rather than put to the engineer, with the runner up named so an override is cheap.

- **Colour stored as a token name, not a hex value.** A `text` column checked against ten token names, so feature 4's design system owns what each colour actually looks like in light and dark. Runner up was a raw hex string, simpler and free of a constraint to widen later, but it hardcodes appearance into your data and cannot adapt to a dark theme.
- **Two migration files rather than one.** Schema and policies in `core_schema`, the trigger and the category list in `seed_new_user`. The starting category list is the part most likely to change, and separating it keeps that change small and readable. Runner up was one atomic file, which is tidier to apply and makes every future tweak to the list a diff against a large migration.
- **No icon column.** Icons need feature 4 to exist before they mean anything, and an icon name with no icon set is a string that lies. Runner up was adding it now as nullable, which costs nothing but invites the build to invent an icon set.
- **A second Vitest config for integration tests.** `vitest.integration.config.mts` and a `test:integration` script, so network dependent tests never run inside `npm test` and never slow the pre commit hook. Runner up was one config with a tag filter, which is fewer files and makes it easier to run the network suite by accident.
- **`color` defaults to `slate`.** A category can be created without choosing a colour, which matters because feature 9 does not exist until Release 2 and nothing else would supply one. Runner up was a nullable column, which pushes the fallback into every screen that renders a category.
- **Test only environment values live in a separate optional schema in `lib/env.ts`.** The required app schema stays four values, so `npm run dev` never demands test credentials. Runner up was adding them as optional fields to the existing schema, which mixes two audiences in one object.
- **No SQL aggregate function in this feature.** Feature 8 is marked in the scope as a real design call, and writing its total now means guessing the shape of a decision deliberately left open. Runner up was shipping a month by category function here, which would have made feature 8 a rendering task.

## What was ruled out and why it is worth remembering

- **A future date check on `occurred_on`.** Offered and declined, correctly. What today is depends on `APP_TIMEZONE`, which a check constraint cannot read reliably, and it would block logging tomorrow's rent when you pay it tonight. If it is ever wanted, it belongs in the form, not the database.
- **Soft deletes.** Not offered as the recommendation, and the engineer chose hard delete. Soft deletes pollute every query, break the case insensitive unique index on category names, and create rows that exist and do not. Hiding a category is the narrow, explicit case where retention is genuinely wanted, and it is a boolean rather than a general mechanism.
- **A sort order column on categories.** Offered and not chosen. Categories will sort by name until there are enough of them for that to annoy you, at which point it is one nullable integer.
- **Optimistic concurrency on edits.** Offered and declined in favour of last write wins. Recorded in the index Consequences as a silent data loss path that now exists, small as it is for one person.
