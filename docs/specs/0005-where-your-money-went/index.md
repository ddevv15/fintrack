# 0005. Where your money went

**Date**: 2026-08-25
**Status**: Proposed

## Summary

FinTrack gets the screen it exists for: open `/breakdown` and see how much you spent this month and which categories took it, biggest first. Every total is added up in TypeScript from the same month of rows the transactions list shows, so the two screens can never disagree, and no new database object has to be secured. Percentages use the largest remainder method so the column always adds to 100 instead of to 101. If anything about the query goes wrong, the screen shows no figures at all and hands over to the error page, because a total that is quietly short is worse than an honest failure.

## Requirements

**User stories**:

- As the person using FinTrack, I want one screen that says where this month's money went, so I get the answer without adding anything up myself.
- As the person using FinTrack, I want the biggest category to stand out, so the answer arrives at a glance rather than after reading every row.
- As the person using FinTrack, I want a month with nothing in it to say so plainly, so an empty month never looks like a broken screen.
- As the person using FinTrack, I want a total I can trust or no total at all, so I never act on a figure that is quietly missing entries.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: `/breakdown` shows the total spent in the current month, where "current" is decided by the signed in person's own timezone, and the figure is the exact sum of every spend entry whose `occurred_on` falls inside that month.
- **AC-2**: The screen lists one row for every category with spending this month, each showing the category name, its colour, its amount, and its share of the month as a whole number percent. A category that has spending but whose share rounds down to zero reads `<1%` rather than `0%`.
- **AC-3**: Rows are ordered by amount, largest first, ties broken by category name A to Z compared in a fixed `en-US` locale rather than the runtime default, so two loads of identical data produce an identical order on any machine.
- **AC-4**: The whole number shares computed for the rows add up to exactly 100 whenever at least one row exists.
- **AC-5**: Each row carries a bar whose length equals the percent shown beside it, filled with that category's colour, and hidden from assistive technology because the row already states the same fact in text.
- **AC-6**: Income entries are never counted, in the total or in any row, even once feature 14 makes them loggable.
- **AC-7**: A category marked hidden that still has spending this month appears in the list under its own name.
- **AC-8**: A month with no spending shows an empty state naming the month and offering a link to log a spend, and never presents a zero total as though it were a result.
- **AC-9**: If the query fails, or if the number of rows received does not match the exact count the database reports for that same filter, the screen renders no money figure at all and the route error boundary is shown instead. The check compares against the reported count rather than against the length of the array, so a server side row limit cannot defeat it.
- **AC-10**: Every amount on the screen is rendered by the `Amount` component with the currency taken from `getSettings()`, never from `APP_CURRENCY`.
- **AC-11**: The heading names the month and the year, for example "August 2026", produced by `lib/time.ts` rather than by an `Intl` call in a component.
- **AC-12**: The whole screen is server rendered, so no amount and no currency code reaches the browser as data. It is reachable and readable by keyboard alone, the breakdown reads to a screen reader as a list of name, amount, and share, and the route passes the existing axe check at WCAG 2.2 AA.
- **AC-13**: A request that is not signed in never reaches `/breakdown` and never sees any part of it.
- **AC-14**: The Breakdown tab shows as the active tab while on this route, and its prefetch is switched back on now that the route exists.

## Decision

**Chosen option**: Option 1: read the month's rows through the existing SDK query and total them in TypeScript.

The breakdown is computed at read time in a pure function from the same month scoped, spend filtered query that feature 7's list uses, with the category embedded in the one request, and it adds no table, view, function, or migration to the database.

**Implementation skills**: `insforge` (`InsForge`, `~/.agents/skills/insforge/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

This feature adds no table, no column, no view, no function, and no migration. It reads what spec 0002 already built, and the index `(user_id, occurred_on DESC, created_at DESC)` that spec already created is the one the month filter uses.

What it reads, in one request:

| Source | Fields used | Filter |
|---|---|---|
| `transactions` | `amount_minor`, `category_id` | `direction = 'spend'`, `occurred_on >= start`, `occurred_on < endExclusive` |
| `categories`, embedded in the same request | `id`, `name`, `color` | none, so a hidden category still reports (spec 0002 AC-5) |

What it derives in memory. This is the shape `/develop` builds and the unit tests assert against:

| Type | Field | Type | Notes |
|---|---|---|---|
| `MonthBreakdown` | `month` | `PlainDate` | the range start, and the source of the heading |
| | `totalMinor` | `MinorUnits` | exact integer sum of every row |
| | `rows` | `readonly CategoryShare[]` | biggest first, ties by name |
| `CategoryShare` | `categoryId` | `string` | |
| | `name` | `string` | |
| | `color` | `CategoryColor` | drives the chip and the bar fill |
| | `amountMinor` | `MinorUnits` | exact integer sum for that category |
| | `percent` | `number` | whole number, largest remainder, the row set adds to 100 |

A Zod schema validates the embedded row shape on the way in, so a renamed column is a loud error rather than a wrong number on screen, matching spec 0002 AC-9.

**State transitions**: none. This screen reads; it changes nothing and no entity here has a lifecycle.

**API surface**: this feature adds no HTTP endpoint, no server action, and no SQL function. Its whole surface is one read through `@insforge/sdk`, plus one route.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/breakdown` | GET (page) | none from the URL; the month comes from the server | rendered HTML: month heading, total, ranked rows | signed in, enforced by `proxy.ts` and the `(app)` layout | redirect to sign in when signed out, redirect to `/setup` when the profile is incomplete, error boundary on any read failure |
| `transactions` | select | `direction=spend`, `occurred_on` range, exact count requested, `limit(MAX_MONTH_ROWS)`, embedded `categories(id,name,color)` | rows of `amount_minor` plus the nested category, and the exact count for the same filter | signed in, own rows only, by row level security | received row count not matching the reported exact count, which is thrown rather than truncated; any SDK error, which is rethrown |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| load the breakdown | the month start and end | `currentMonthRange(new Date(), settings.timezone)` in `lib/time.ts`, never the server clock or the browser |
| load the breakdown | the person's timezone | `getSettings()`, a `profiles` column, decided in spec 0004 |
| load the breakdown | which rows count as spending | the `direction` enum column, decided in spec 0002 |
| load the breakdown | each category's name and colour | the embedded `categories` rows in the same request, unfiltered by `is_hidden` so AC-7 holds |
| load the breakdown | proof that no row was dropped | the exact count the database reports for the same filter, compared against the rows received, never the array length alone |
| load the breakdown | the shape of the embedded category | pinned by `monthSpendRowSchema` in `lib/schema.ts` to whatever the composite key embedding actually returns, proved against the backend before the schema is written |
| load the breakdown | the month total | derived: exact integer sum of `transactions.amount_minor`, no rounding involved |
| load the breakdown | each category amount | derived: exact integer sum of that category's `amount_minor` |
| load the breakdown | each percent share | derived: `percentShares()` in `lib/money.ts` from the category amounts and the total |
| load the breakdown | the row order | derived: amount descending, then `localeCompare` on the name in a fixed `en-US` locale, ascending |
| load the breakdown | which category wins a rounding tie | derived: the leftover percentage points go to the rows in the order above, so the shares and the ranking cannot disagree |
| render the screen | the currency and its decimal places | `getSettings()`, `profiles.currency` plus `decimalsFor()`, decided in spec 0004 |
| render the screen | every formatted amount | `formatAmount()` through the `Amount` component, the only place an amount is divided |
| render the screen | the month heading text | new `formatMonth()` in `lib/time.ts`, the only place a date becomes text |
| render the screen | the heading locale | the `en-US` default already used by `formatPlainDate()`, since no locale exists on the profile yet |
| render the screen | each bar length | derived: the same whole number percent shown in the row, so the two cannot disagree. A zero share renders a zero width bar |
| render the screen | a share below half a percent | derived: rendered as the literal text `<1%` when the share is zero and the amount is not |
| render the screen | each bar colour | the `categorySwatchClasses` map already exported by `CategoryChip`, never an interpolated class name |

**Key invariants**:

- The total always equals the sum of the row amounts. Both come from the same pass over the same rows, so a mismatch is impossible by construction rather than by a check.
- Every amount is a whole number of minor units at every step. Nothing here divides an amount; only `formatAmount()` does, at the very edge.
- The computed shares add to exactly 100 whenever there is at least one row.
- A share is never rendered next to a bar of a different length.
- Nothing partial is ever rendered. Either the whole breakdown is available or the screen renders no figures at all, and "whole" is proved against the database's own count rather than assumed from the rows that arrived.
- The order of the rows and the awarding of leftover percentage points follow the same comparison, so a row can never show a share that its position contradicts.
- No row from another account can appear, enforced by row level security in the database rather than by a filter in this code.

**Security model**: read only, and only your own rows. `proxy.ts` refuses a request with no session before this route runs, and the `(app)` layout calls `requireUser()` as the second gate, both established in spec 0004. Every row returned is scoped by the row level security policies from spec 0002, so this feature adds no new access rule and no new attack surface. Being fully server rendered, no amount, category name, or currency code is serialised into the page as client data. This feature triggers no new compliance scope: it displays personal financial data that the account already owns, and stores nothing new.

**Configuration required**: none. No new environment variable, secret, or third party credential. `MAX_MONTH_ROWS` is a code constant, not configuration, because it bounds how much this screen will hold in memory. It is deliberately no longer the safety check: correctness rests on the exact count comparison, which holds whatever the server's own row limit turns out to be.

**Critical test scenarios**:

- Happy path: a month with entries across several categories renders the exact total, one row per category ordered biggest first, and shares adding to 100, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
- Rounding: three categories at one third each produce 34, 33, and 33 rather than 33, 33, 33, and the 34 lands on the row that sorts first, verifies **AC-3**, **AC-4**.
- Rounding, small share: a category holding well under half a percent of the month reads `<1%` and not `0%`, verifies **AC-2**.
- Deterministic order: two categories with identical totals appear in name order on every load, verifies **AC-3**.
- Filtering: a month holding both spend and income entries totals only the spend, verifies **AC-6**.
- Hidden category: a hidden category with spending this month still appears under its name, verifies **AC-7**.
- Empty: a month with nothing logged shows the empty state and no total, verifies **AC-8**.
- Failure case: a rejected query, and separately a response whose row count is short of the database's reported exact count, both render no money figure and reach the error boundary, verifies **AC-9**.
- Currency: an account on a zero decimal currency such as yen renders whole units, not hundredths, verifies **AC-10**.
- Auth/permission: a signed out request to `/breakdown` is redirected and sees no part of the screen, verifies **AC-13**.
- Accessibility: the route passes axe at WCAG 2.2 AA, the list is reachable and readable by keyboard, and the bars announce nothing, verifies **AC-5**, **AC-12**.

## Build plan

Ordered by the project's Skateboard approach: slice 1 is the thinnest version of this screen you would genuinely use, slice 2 makes it trustworthy in the states that are not the happy path, slice 3 proves it.

**Slice 1: the screen that answers the question**

1. Add `formatMonth()` to `lib/time.ts`, returning "August 2026" from a `PlainDate`, formatted in UTC for the same reason `formatPlainDate()` is, satisfies **AC-11**
2. Add `percentShares()` to `lib/money.ts`, taking the already ordered category amounts and the total and returning whole number shares by the largest remainder method, awarding leftover points in the order it received them so a tie is never resolved arbitrarily, satisfies **AC-3**, **AC-4**
3. Run the embedded query once against the non production backend branch and record what it returns. The foreign key here is the three column composite from spec 0002, which is a narrower path than a single column one, so confirm the category arrives as an object rather than a one item array before any schema is written, satisfies **AC-2**, **AC-7**
4. Add `monthSpendRowSchema` to `lib/schema.ts`, shaped to exactly what that query selects. `transactionSchema` cannot be reused: it requires columns this query deliberately does not fetch, satisfies **AC-2**
5. Add `lib/breakdown.ts` with `loadMonthBreakdown()`: resolve the month from `getSettings().timezone` through `currentMonthRange()`, run the spend filtered query with the category embedded, validate with `monthSpendRowSchema`, sum per category and overall, sort by amount descending then name ascending in a fixed `en-US` locale, and attach the shares, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**, **AC-7**
6. Add `components/breakdown/BreakdownRow.tsx`: name, colour swatch, `Amount`, percent, and the bar sized by inline width because Tailwind cannot generate a dynamic width class, coloured from the `categorySwatchClasses` map and marked `aria-hidden`. A share of zero against a non zero amount renders `<1%` and a zero width bar, satisfies **AC-2**, **AC-5**
7. Add `app/(app)/breakdown/page.tsx` as a server component: month heading, total, and the ranked list, passing `settings.currency` to every `Amount`, satisfies **AC-1**, **AC-10**, **AC-12**
8. Switch `prefetch` back on for the Breakdown tab in `components/ui/AppShell.tsx` and drop the comment that explains why it was off, satisfies **AC-14**

**Slice 2: make it trustworthy**

9. Add the empty state: when there are no rows, render `EmptyState` naming the month with a link to `/`, the Log tab, and render no total at all, satisfies **AC-8**
10. Add the completeness guard: request the exact count alongside the rows, throw when the rows received do not match it, and rethrow any SDK error rather than returning a partial result, so the route error boundary handles both. Keep `MAX_MONTH_ROWS` as an explicit limit bounding memory, set below whatever the backend's own row limit turns out to be, satisfies **AC-9**

**Slice 3: prove it**

11. Unit tests in `tests/unit/` for `percentShares()` (the thirds case and which row takes the extra point, a single category at 100, a share that rounds to zero, an empty input) and for the sorting and summing in `loadMonthBreakdown()`, satisfies **AC-2**, **AC-3**, **AC-4**
12. Extend the Playwright axe check to cover `/breakdown`, and record the keyboard and screen reader pass in `docs/accessibility-pass.md`, satisfies **AC-5**, **AC-12**
13. Confirm route protection against a signed out session, satisfies **AC-13**

## Consequences

**Positive**:

- No new database surface at all, so there is no new row level security policy to reason about and no chance of a `SECURITY DEFINER` function quietly bypassing the rules that protect every other table.
- The breakdown and the transactions list are computed from the same rows with the same filters, so the two screens are structurally incapable of showing different totals for the same month.
- Every arithmetic step stays in a pure function, which makes the two things most likely to be subtly wrong, the rounding and the ordering, directly unit testable without rendering anything.
- The screen is fully server rendered with no client JavaScript of its own, so it inherits list semantics from the browser and keeps money off the wire as data.
- Adding month navigation later is a change to how the month argument is chosen, not a rewrite, because the loader already takes a month.

**Negative / tradeoffs**:

- The whole month of rows crosses the network to be added up in the application, which is work Postgres could do in one pass. It is fine for one person and one month, and it is the wrong shape for feature 16's trends across many months, which will need a real SQL aggregate.
- The completeness guard turns an absurd month into a hard error rather than a slow screen. That is deliberate, but it does mean a scenario exists where the screen refuses to render at all rather than degrading. It also costs a count on every load, which is a small price for the only check a server side row limit cannot defeat.
- A category whose true share is above zero but below half a percent displays as `<1%` while counting as 0 in the shares. The numbers computed add to 100, but a reader adding up the visible column in that rare case would not reach it. The alternative, forcing every category with spending up to at least 1 percent, distorts the large categories to pay for the small ones, which is the worse lie.
- The month heading is formatted in `en-US` regardless of who is reading, because the profile carries a currency and a timezone but no locale.

**Neutral**:

- One new module (`lib/breakdown.ts`) and one new component folder (`components/breakdown/`), both following the existing layout rules.
- Two additions to existing modules, `formatMonth()` in `lib/time.ts` and `percentShares()` in `lib/money.ts`, both landing in the module that already owns that kind of conversion.
- This screen has nothing to show until feature 6 exists to log a spend, so it is best built after it. Nothing in this spec depends on feature 7.

## Follow-up

- [ ] Feature 16, trends across months, is where a SQL aggregate earns its cost. When it arrives, revisit whether the breakdown should read from the same aggregate rather than keeping two ways to total a month.
- [ ] The profile has no locale column, so dates and month names are formatted `en-US` for everyone. Worth deciding alongside any future work on where a person is, rather than guessing a locale from the currency or the timezone.
- [ ] Category rows are deliberately not tappable. When feature 10 adds filtering, revisit whether a row should link into the filtered history, which is the obvious next question this screen provokes.
- [ ] Find the backend's real row limit during the build and set `MAX_MONTH_ROWS` below it. Correctness no longer depends on this number, since the exact count comparison catches a short result whatever the limit is, but a limit above the server's own would still be a misleading thing to leave in the code.
- [ ] Build task 3 proves how the composite key embedding actually returns. If PostgREST turns out not to embed across the three column key at all, that invalidates the one request design and this spec needs revisiting before slice 1 continues, most likely toward two queries joined in memory.
