# 0005. Where your money went: reasoning

The decision record for [index.md](index.md). Not read during a build.

## Context

FinTrack exists to answer one question: where did the money go this month. Features 6 and 7 make that question answerable by letting you log a spend and see the list of what you logged, but a list is not an answer. Adding up thirty rows in your head is exactly the work the app was supposed to remove. This is the screen the whole of Release 1 is building toward, and the scope calls it the core value screen.

Three forces already fixed by earlier specs shape how it can be built. Spec 0002 stores money as whole minor units in a `bigint` column and enforces ownership with row level security on every table, so any new way of reading those rows inherits an obligation to keep both properties intact. Spec 0004 moved the currency and the timezone onto the profile, which means the boundaries of "this month" and the way an amount reads are facts about the person, resolved per request, not settings of the server. Spec 0003 built a token first component set on plain HTML elements with no chart library anywhere in the project, and reserved the ten category colours for chips "and, later, chart swatches", which is this screen.

The awkward technical fact is that the InsForge SDK speaks PostgREST, and PostgREST has no `GROUP BY`. It filters, orders, embeds related rows, and paginates, but it will not aggregate across rows. A per category total is therefore not a query option to select; it is a decision about where the arithmetic happens, and each answer carries a different obligation. Doing it in the database means creating a new object, and a new object means a new place for the row level security rules to be got wrong. Doing it in the application means moving rows across the network and taking responsibility for the one failure that this project's rules single out above all others: a total that is quietly short because some rows never arrived.

The consequence of not deciding is that whoever builds it invents an answer under time pressure, and the plausible wrong answer here is a `SECURITY DEFINER` function, which reads every account's rows by design and would leak one person's spending into another's screen the moment this app had a second user.

## Options considered

### Option 1: total the month's rows in TypeScript

Select the month's spend rows through the same SDK query feature 7 already uses, with the category embedded, and add them up in a pure function.

**Pros**:

- No new database object, so no new row level security policy to write, review, or get wrong.
- The totals come from the same rows the transactions list shows, so the two screens cannot disagree about a month.
- The arithmetic is a pure function over plain data, which is the easiest possible thing to unit test, and the two subtle parts (rounding and tie ordering) become directly testable.
- Sums are exact. `amount_minor` is already validated as a safe integer by `lib/schema.ts`, and `formatAmount()` throws on anything that is not, so integer addition in JavaScript is exact rather than merely close.

**Cons**:

- Transfers a whole month of rows to compute a handful of numbers, which is work the database could do in one pass.
- Introduces a row limit the code has to defend against, because a silently truncated result set is a silently wrong total.
- Does not generalise to feature 16, where totalling many months this way would be genuinely wasteful.

### Option 2: a SQL view grouped by month and category

A migration creating a view that groups spending by month and category, with `security_invoker` set so the querying account's row level security still applies, read with a month filter.

**Pros**:

- Postgres does the aggregation and returns a handful of rows instead of hundreds.
- Correct by construction at any data volume, with no row cap to defend against.
- Sets up feature 16 properly, since a view grouped by month is exactly what a trends screen wants.

**Cons**:

- New database surface that must be secured and tested. `security_invoker` is off by default on a Postgres view, and forgetting it is a silent, total leak of every account's data rather than a visible error.
- A view cannot take parameters, so the grouping has to be fixed in the view and the month applied as a filter afterwards, which constrains what the view can be later without a migration.
- Splits the source of a month's total across two mechanisms: the list reads rows, the breakdown reads the view. They can drift.

### Option 3: a SQL function called as a remote procedure

A function taking the month range and returning one row per category, invoked through the SDK.

**Pros**:

- The most flexible option, and the best groundwork for feature 16 and for feature 13's budgets, both of which want parameterised aggregates.
- Keeps all the arithmetic in one place, in the database, close to the constraints that already guarantee the data is sane.

**Cons**:

- The most dangerous option in this specific project. A function written `SECURITY DEFINER`, which is a common habit and sometimes necessary, runs with the definer's rights and bypasses row level security completely. This project's rules state plainly that a table with no policy is a data leak; a definer function over a protected table is the same leak with extra steps.
- Most machinery for the least return at this size: a migration, a function, a new Zod schema for its return shape, and an integration test, to total what is realistically a few dozen rows.
- Hardest of the three to test offline, since it cannot run without a database.

## Rationale

Option 1 wins on the forces that actually apply here, not on general principle. At the scale this app is built for, one person and one month, the network cost that makes Option 1 look wasteful is a few dozen rows, while the security cost that makes Option 3 look dangerous is unbounded. When the downside of one option is measured in kilobytes and the downside of another is measured in other people's financial data, the choice is not close.

The reuse argument is what settles it against Option 2. Feature 7 already loads the same month, filtered the same way. Computing the breakdown from that same query means there is one definition of what a month contains, in one place, and the guarantee that the list and the breakdown agree is structural rather than a thing someone has to remember. A view would give a second, independent definition of the same month, and two definitions of one number is how a money app ends up showing two different totals for August.

Completeness of the result deserves its own note, because it is the one place Option 1 could produce exactly the failure this project fears most. `AGENTS.md` says a wrong money figure shown confidently is worse than an honest error, and a result set truncated at a server side limit is the purest form of that: every number on screen looks fine and the total is short.

The first version of this spec guarded it by asking for one row more than a chosen cap and throwing when that many arrived. A cross check showed that guard defeats itself. PostgREST carries its own server side row limit, and if that limit sits below the chosen cap the server truncates before the application sees anything, the extra row never arrives, and the check stays silent while the total is wrong. A guard that fails exactly when it is needed is worse than no guard, because it invites trust. The check therefore compares the rows received against the exact count the database reports for the same filter. That number comes from Postgres rather than from the length of the array handed back, so no server setting can quietly make it agree. The explicit limit stays, but only as a bound on how much this screen will hold in memory.

On the percentages, largest remainder was chosen over independent rounding for the same reason. Rounding each share on its own is simpler and defensible, since nothing on screen ever claims the column adds up. But a reader can add it up, and a column of numbers that comes to 101 is a visible wrongness in an app whose whole promise is that its numbers are right. Fifteen deterministic, testable lines is a cheap price for removing it. The honest cost, recorded in the spec's Consequences, is that a category below half a percent shows as `<1%` while counting as zero, so the visible column can still miss 100 in that rare case. Forcing every nonzero category up to 1 percent would fix the column by distorting the large categories, which trades a rare small inaccuracy for a common larger one.

One assumption in this design is worth naming as an assumption. Reading the category in the same request relies on PostgREST embedding across the three column composite foreign key that spec 0002 deliberately built, which is a narrower path than the ordinary single column case. It is very likely to work, and it fails loudly rather than quietly if it does not, but the build proves it against the real backend before any schema is written, because the whole one request shape rests on it. Two queries joined in memory is the fallback, and it costs only a round trip.

Three smaller calls were made rather than asked. The bar is sized by the same whole number percent shown beside it, not by the exact ratio, so the picture and the number can never contradict each other even by a fraction. The month heading gets a new `formatMonth()` in `lib/time.ts` rather than an `Intl` call in the page, because spec 0003 made that module the only place a date becomes text, and the value sourcing pass showed the existing `formatPlainDate()` offers no month and year style. That gap would otherwise have surfaced mid build as a small rule to quietly break. And the name comparison that breaks a tie is pinned to `en-US` rather than left to the runtime default, since a comparison that varies by machine is exactly the nondeterminism the tie rule exists to remove.
