# 0009. Search and filter your history · rationale

The reasoning behind [index.md](index.md). Not read during a build.

## Context

> ⚠️ Premise note: text search here can only ever find what you typed into a note. The `transactions` table has a `merchant` column, but no screen writes it: the log form and the edit form both leave it alone, and `actions/transactions.ts` says so explicitly. So if you have been logging spends without notes, the search box will find nothing, and the feature will feel broken when it is working correctly. The right framing is that this feature has two halves and only one is in scope here: the finding, which this spec covers, and having something worth finding, which is a question about what the log form captures. Worth deciding separately, and noted as a follow up rather than folded in.

FinTrack can show you this month and nothing else. `/transactions` lists the current month and `/breakdown` totals it by category, both scoped to the month you are in, in your own timezone. Everything before this month is stored and unreachable. Two jobs are blocked by that: chasing down one specific charge you half remember, and looking at one category over a stretch of months to see whether a habit is growing.

Three forces shape the answer, and all three come from this repository rather than from general practice.

The first is the month invariant. `lib/month.ts` exists because `/transactions` and `/breakdown` both total the same month, and if each wrote its own window and its own spend filter, a change to one would leave the other reporting a different total with nothing to say which is right. `tests/unit/month-window.test.ts` enforces this by scanning the two loader bodies for hand written `occurred_on` bounds, a hand written `direction` filter, and a hand written `count: "exact"`. A cross month read needs all three of those things, so it either lives inside that shared definition or it becomes the second definition the invariant was written to prevent.

The second is the honesty rule. Rule 3 of `AGENTS.md` says errors are explicit and a wrong money figure shown confidently is worse than an honest error, and `assertCompleteMonthRead()` implements it by comparing rows received against a count Postgres produced independently. A month has a natural bound of about thirty days of entries. A filtered range has no bound at all, so whatever caps the read has to answer what happens when the cap is hit, and a total over a capped set would be exactly the confidently wrong figure the rule forbids.

The third is the persistence requirement. The scope says the filters have to survive a page reload, and that single sentence decides more than it looks: where the state lives determines whether the page can stay a Server Component, whether money keeps being rendered on the server, and whether the back button behaves. It also runs into spec 0007 AC-13, which refused to put a money figure in the URL, so a URL based answer has to explain why it is not the same thing.

Not deciding means either no way to reach your own history, or a second screen inventing its own answers to all three questions partway through a build.

## Options considered

### Option 1: filters added to `/transactions`

Keep one list screen. It defaults to the current month and gains filter controls that widen or narrow it from there.

**Pros**:
- One transaction list in the whole app, so there is only one set of row affordances to explain and only one place to fix a rendering bug.
- The person never has to learn that history lives somewhere else.
- No new navigation entry, so the bottom bar stays at four items.

**Cons**:
- `loadMonthTransactions()` either grows branches for the filtered case or the page calls a second loader when params are present, and both leave the month invariant scan checking a function that is no longer the only path.
- Spec 0007 is `Accepted` and its AC-1 through AC-7 are written about a month. Filtering the same screen either contradicts them or requires rewriting an accepted contract.
- The month total above the list stops meaning the month as soon as a filter is applied, so the heading and the figure have to change together and can get out of step.

### Option 2: a separate `/history` screen reading through a generalised range read

`/transactions` is untouched. `/history` is a new server rendered screen whose filters live in the URL. `lib/month.ts` grows `readSpendRange()` with optional bounds and optional category and note filters, and `readSpendMonth()` becomes a thin wrapper that supplies the month window and then asserts completeness exactly as it does now.

**Pros**:
- The month screens keep the exact behaviour three accepted specs describe, because their loaders' bodies do not change at all.
- One definition of a spend read still serves the whole app, and the invariant grows to cover three loaders rather than being routed around by a second one.
- The two screens can answer to two different standards honestly: the month refuses to render when it cannot be proved whole, and history states what it is showing out of what matched.
- Each screen's job is legible from its name, which is most of why a person finds a feature at all.

**Cons**:
- `lib/month.ts` gets edited, and it is the file the app's most important correctness guarantee lives in.
- Two screens now list transactions, and their row affordances differ, which has to be explainable rather than looking like an inconsistency.
- A fifth navigation tab crowds the phone bottom bar.

### Option 3: a separate `/history` screen with its own independent read

The same new screen, but with its own query in `lib/history.ts` writing its own `direction` filter, its own `occurred_on` bounds, and its own exact count. `lib/month.ts` is not touched.

**Pros**:
- Zero risk to the month screens, since no shared code changes at all.
- The history read can be shaped exactly for its own job with no wrapper indirection.
- Fastest of the three to build.

**Cons**:
- The spend filter and the completeness comparison genuinely exist in two files, which is precisely the drift the month invariant was written to prevent, reintroduced through a different door.
- The failure it invites is silent and specific: filter `/history` to exactly the current month and its total should equal the one on `/transactions`. Computed by two pieces of code, those can diverge, and two money figures that disagree with neither complaining is the worst failure this app has.
- A scan can check that history does not hand write a month window, but it cannot check that two independent reads agree.

## Rationale

Option 2, because the invariant's actual purpose settles the route question rather than taste doing it. The month invariant is not a rule about months; it is a rule that two screens must never compute the same money figure from two definitions. Filtering `/history` to the current month with no category is not a hypothetical, it is the obvious first thing anyone does with a date range, and it produces a total that must equal the one on `/transactions`. Under option 3 those two totals come from two pieces of code and can drift with nothing to notice. So the invariant does extend to history, and the only honest way to extend it is to share the read.

That shared read is an extraction rather than a rewrite, which is what keeps the risk proportionate. The three regular expressions in `tests/unit/month-window.test.ts` all match code that stays in `lib/month.ts`, the two month loader bodies do not change a character, and `assertCompleteMonthRead()` keeps being called from the same place with the same arguments. The regression surface is real but it is small and it is covered by tests that already exist, which is why the extraction is the first task in the build plan rather than something done opportunistically later.

The conditional total is the part that looks like extra work and is not. The exact count is already being fetched for the honest `newest 200 of N` line, and that count is the same independent number `assertCompleteMonthRead()` uses to catch a truncated read. Once you have it, comparing it against the rows you received costs nothing and cleanly separates the two cases: a complete set gets a total summed in one pass over exactly what was rendered, and a capped set gets no total plus a sentence saying to narrow the filters. That withholds a figure it cannot prove instead of showing a partial one, which is rule 3 followed rather than worked around, and it means the feature answers what you spent on one category over a stretch, which is half the reason the scope row exists.

On the URL carrying a typed note term, spec 0007 AC-13 is narrower than it first appears and does not forbid this. What it refused was a confirmation naming a stored money figure surviving in a bookmark, and the harm was staleness: the figure was a claim about data that could later be false, shown confidently long after it stopped being true. A filter term is the opposite in every respect that mattered there. It is input the person just typed, it is visible in the field on screen, it makes no claim about any stored value, and it cannot go stale because it is re executed against live data on every request. The residual cost is genuine and is recorded as a negative consequence: the term sits in browser history and is visible on a shared device. It is accepted because the alternatives are worse. Keeping the term out of the URL means it does not survive a reload, which contradicts the requirement outright. Moving all the state to browser storage costs the Server Component, and with it the rule that money is rendered on the server and never reaches the browser as data. Storing filters in the database turns a reload into a network round trip and a filter change into a write, which is a great deal of machinery for a preference.

The row cap answers the same honesty question with less machinery than pagination. Two hundred rows with an exact match count states plainly what is being shown and what matched, so nothing is hidden and nothing errors. Keyset pagination is the better end state and stays available, but it buys a cursor, a client interaction, and more surface to get wrong before there is any evidence a personal ledger will exceed one page, and the Skateboard approach says to ship the thinnest usable whole and grow it.

Two smaller calls are worth recording because they are the kind that get invented wrong during a build. The to date is inclusive as a person expects, converted exactly once into the half open `endExclusive` bound the shared read takes, so a human expectation and a query contract meet in one named place instead of an off by one day appearing later. And the LIKE metacharacters in a typed term are escaped inside the shared read rather than by the caller, because a caller that forgets turns a typed `%` into a filter matching every row, and putting the escaping where it cannot be skipped is the only version of that rule that stays true.
