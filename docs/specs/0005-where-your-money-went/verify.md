# Verify: where your money went · spec 0005 · updated 2026-08-25

_Steps derived from spec 0005 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Most of this needs a signed in account with spending in the current month.
`npx playwright test --project=chromium-signed-in` builds exactly that and takes
it back out afterwards, so it is the cheapest way to reach the populated screen.

## Commands

- [ ] `npm run test` → 187 passing, including `percentShares`, `formatMonth`, and `summariseMonth` → AC-2, AC-3, AC-4, AC-11
- [ ] `npx playwright test` → 58 passing, including axe at WCAG 2.2 AA on `/breakdown` in both themes → AC-5, AC-12, AC-13
- [ ] `npm run test:integration` → still green, so the breakdown's query has not disturbed the row level security or drift suites → AC-9
- [ ] `npm run build` → the route compiles and no category colour class is dropped from the production CSS → AC-5

## UI / manual

### The month, and where it comes from

- [ ] Sign in, open `/breakdown` → the heading reads the current month and year, for example "August 2026" → AC-11
- [ ] Change the profile timezone to `Pacific/Kiritimati`, reload on the last day of a month after 11:00 UTC → the heading and the total move to the next month before they would in `America/New_York` → AC-1, **month range source**
- [ ] Confirm the heading text comes from `formatMonth()` in `lib/time.ts` and no component calls `Intl` on a date → AC-11, **heading text source**
- [ ] On the first of a month, confirm the heading names that month and not the previous one → AC-11, **heading locale / UTC formatting**

### The total and the split

- [ ] Log several spends across three categories → the total equals their exact sum, to the minor unit → AC-1, **month total source**
- [ ] Add the category amounts by hand → they equal the total exactly → AC-1, **category amount source**
- [ ] Add the percent column by hand → it comes to exactly 100 → AC-4, **percent share source**
- [ ] Log three spends of equal value in three categories → shares read 34, 33, 33 and the 34 sits on the row listed first → AC-3, AC-4, **rounding tie source**
- [ ] Log one spend of 0.01 alongside one of 99.99 → the small one reads `<1%`, never `0%`, and the column still totals 100 → AC-2, **sub half percent source**

### Order

- [ ] Confirm rows run largest amount first, top to bottom → AC-3, **row order source**
- [ ] Give two categories identical totals with names that differ → they appear in A to Z order, and in the same order after a reload → AC-3
- [ ] Reload three times → the order never changes → AC-3

### What counts, and what does not

- [ ] Log an income entry in the same month → the total and the rows are unchanged by it → AC-6, **spend filter source**
- [ ] Hide a category that has spending this month → it still appears in the list, under its own name → AC-7, **category name source**
- [ ] Log a spend dated the last day of the previous month → it does not appear → AC-1

### Money and currency

- [ ] Confirm every amount renders through `Amount` with the currency from `getSettings()`, and that `APP_CURRENCY` appears nowhere in the rendered output → AC-10, **currency source**
- [ ] Sign in as an account on `JPY` → amounts read as whole yen with no decimal point, and the stored integer is unchanged → AC-10, **formatted amount source**

### The bar

- [ ] Compare each bar's width against the percent printed beside it → they agree → AC-5, **bar length source**
- [ ] Confirm each bar carries its own category's colour, not a single shared one → AC-5, **bar colour source**
- [ ] Inspect a bar → it is `aria-hidden="true"` and carries a `bg-category-*` class, never an interpolated one → AC-5
- [ ] A category at 0 percent → renders a zero width bar rather than a missing one → AC-2, AC-5

### The states that make it trustworthy

- [ ] Open `/breakdown` in a month with nothing logged → an empty state naming the month, with a link to log a spend, and **no total anywhere on the screen** → AC-8
- [ ] Confirm the empty month never renders a `$0.00` total → AC-8
- [ ] Force the query to fail (revoke the session mid request, or point the SDK at a bad URL) → the route error boundary shows and no money figure renders → AC-9
- [ ] Force a count mismatch (temporarily set `MAX_MONTH_ROWS` in `lib/breakdown.ts` below the month's real row count) → the screen refuses to render a total and names the shortfall → AC-9, **completeness proof source**
- [ ] Rename `amount_minor` in a scratch branch of the schema → the screen fails loudly naming the table, rather than showing a wrong number → **embedded shape source**

### Access, and what reaches the browser

- [ ] Sign out, request `/breakdown` → redirected to sign in, and the response body carries neither "Total spent" nor any amount → AC-13
- [ ] View source on the populated screen → the amounts appear as text, and no `amountMinor` or `totalMinor` appears as serialised client data → AC-12
- [ ] Tab through the page → the skip link then the three nav tabs, and nothing else takes focus; no category row and no bar is reachable → AC-12
- [ ] Confirm the Breakdown tab is marked `aria-current="page"` while on the route, and that its `prefetch` flag is gone from `AppShell` → AC-14

## Acceptance-criteria coverage

- AC-1 covered by the total, timezone, and previous month steps
- AC-2 covered by the row content, the `<1%`, and the zero width bar steps
- AC-3 covered by the order, tie, and reload steps, plus `npm run test`
- AC-4 covered by the hand addition and the thirds steps, plus `npm run test`
- AC-5 covered by the bar width, colour, and `aria-hidden` steps, plus axe
- AC-6 covered by the income step
- AC-7 covered by the hidden category step
- AC-8 covered by the two empty month steps
- AC-9 covered by the failed query and count mismatch steps
- AC-10 covered by the currency and JPY steps
- AC-11 covered by the heading, timezone, and first of the month steps
- AC-12 covered by the view source, tab order, and axe steps
- AC-13 covered by the signed out step
- AC-14 covered by the active tab step

**Not yet covered by anything automated**, and worth a person: the empty state
has no browser test, because the signed in suite seeds a month and clearing it
mid run would race the other tests. It was checked by hand on 2026-08-25 and
found correct. A second test account with no spending would close this.
