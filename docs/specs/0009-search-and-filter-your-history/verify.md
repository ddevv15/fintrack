# Verify: Search and filter your history · spec 0009 · written 2026-08-28

_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Nothing here is ticked yet: the feature is not built. Steps that a test should own once it exists are marked **(auto target)** with the suggested test name.

## The extraction, before anything else

- [ ] Run the existing suites after `readSpendRange()` lands and before `/history` exists → `tests/unit/month-window.test.ts` passes unchanged → AC-20
- [ ] Open `/transactions` and `/breakdown` → both show the same totals they showed before the extraction → AC-20
- [ ] Break the read deliberately on a scratch branch so fewer rows come back than the count reports → both month screens still refuse to render and show the error page → AC-20 (auto target: `month-window.test.ts`)
- [ ] Read `lib/month.ts` → `direction = 'spend'`, both `occurred_on` bounds, and `count: "exact"` each appear exactly once in the file → AC-20

## Listing and ordering

- [ ] Sign in with spends logged across at least three different months and open `/history` → entries from every month are listed, newest first → AC-1
- [ ] Log two spends on the same day → the more recently created one sits above the other → AC-1 (auto target: `history.signed.spec.ts`)
- [ ] Open `/history` with no filters set → the newest entries across all time are shown rather than an empty screen → AC-2
- [ ] File a spend under a hidden category, then open `/history` → it still appears in the list → AC-7
- [ ] Read one row → the date, the category name with its colour chip, the amount, and the note as a truncated subtitle are all there, and the amount is whole → AC-15
- [ ] Inspect a truncated note in the DOM → the full text is present, cut off by CSS only → AC-15

## The filters

- [ ] Set only a category → only that category's entries remain, across every month → AC-2
- [ ] Set only a from date → entries on and after that date remain → AC-2
- [ ] Set only a to date of `2026-08-19` with an entry occurring on the 19th → that entry is included → AC-8
- [ ] Set a to date of `2026-02-28` in a leap year, and one of `2026-12-31` → the day after is computed correctly across the month and the year boundary → AC-8 (auto target: `time.test.ts`)
- [ ] Set only a note term → only entries whose note contains that text remain → AC-2
- [ ] Set all four at once → the result is the intersection of all four → AC-2
- [ ] Search `cof` with a note reading `coffee refill` → it matches → AC-4
- [ ] Search `COF` → it matches the same entry, so the match is case insensitive → AC-4
- [ ] Log a note containing a literal `%`, then search `%` → only that entry comes back, not every entry → AC-4 (auto target: `history-filters.test.ts`)
- [ ] Log a note containing a literal `_`, then search `_` → only that entry comes back, since `_` matches any single character when unescaped → AC-4
- [ ] Log a note containing a literal backslash, then search it → it matches, proving the backslash was escaped first rather than last → AC-4
- [ ] Search a term that appears in the middle of a note → it matches, proving the contains wildcards were added after escaping and not escaped themselves → AC-4
- [ ] Type a category name into the text box → it does not match on the category, only on notes → AC-5
- [ ] Hide three categories, then open the category picker → all three appear, not just one, each labelled `(hidden)` and each in its alphabetical position → AC-6
- [ ] Open the category picker → every spend category is listed name ascending → AC-6
- [ ] Watch the queries for one page load → the category list costs one read, with no usage count join → AC-6
- [ ] Confirm no income category appears in the picker → AC-6

## Persistence and the URL

- [ ] Set all four filters, then reload → the same filters and the same results come back → AC-3
- [ ] Set filters, navigate away, then press back → the filtered view returns → AC-3
- [ ] Press forward again → it still returns → AC-3
- [ ] Copy the URL into a new tab → the same result set renders → AC-3
- [ ] Disable JavaScript entirely, then set and submit filters → the screen still filters correctly → AC-3
- [ ] View source on a filtered `/history` → the amounts are in the HTML, and no filter state or money figure is in a client component payload → AC-3

## The count, the total, and refusing to guess

- [ ] Filter to a set smaller than 200 → a total is shown, and it equals the sum of the amounts listed → AC-11
- [ ] Filter to exactly the current month with nothing else set → the total matches the one `/transactions` shows → AC-21 (auto target: `history-month-agreement.test.ts`)
- [ ] Create more than 200 matching entries → the screen states `Showing the newest 200 of N matches` with the real N → AC-10
- [ ] Check a count above a thousand → it reads with a thousands separator rather than as a bare run of digits → AC-10
- [ ] On that same capped view → no total is shown anywhere, and a line explains that narrowing the filters will show one → AC-11
- [ ] Confirm the capped view shows no zero standing in for the total → AC-11
- [ ] Break the read deliberately on a scratch branch → the error page appears, and no shortened list is shown first → AC-12

## Bad input, and saying so

- [ ] Put `from=banana` in the URL → the page renders, the other filters still apply, and a notice names the from date as dropped → AC-13
- [ ] Put `category=not-a-uuid` in the URL → same, with the category named as dropped → AC-13
- [ ] Put another account's real category id in the URL → it is reported as dropped, worded identically to an id that never existed → AC-13, AC-19
- [ ] Put a note term longer than 500 characters in the URL → it is reported as dropped, since no note that long can exist → AC-13
- [ ] Set a from date later than the to date → a field error names the problem, no results list renders, and no query runs → AC-9
- [ ] Compare that refusal against a filter combination that genuinely matches nothing → the two read as different situations, not the same message → AC-14
- [ ] Open `/history` on a brand new account with nothing logged → the wording says nothing has been logged yet, not that filters matched nothing → AC-14

## Editing from here

- [ ] Read a row's Edit control → its visible text is short and its accessible name identifies the entry, for example `Edit 12.50 Groceries, Aug 19` → AC-16
- [ ] Tab to it → it is reachable by keyboard → AC-16
- [ ] Confirm there is no Delete control on any history row → AC-16
- [ ] Filter, open an entry for editing, save it → you land back on `/history` with the same filters still applied → AC-17
- [ ] On that return → the confirmation names what was actually stored, and it appears once → AC-17
- [ ] Reload that page → the confirmation does not come back → AC-17
- [ ] Press back then forward → it still does not come back → AC-17
- [ ] Check the URL on return → no money figure is in it → AC-17
- [ ] Hand edit the edit URL to `from=https://example.com` → saving returns to `/transactions`, never to the external address → AC-18 (auto target: `history-return-path.test.ts`)
- [ ] Try `from=/settings` → it also falls back to `/transactions`, since only the two list routes are allowed → AC-18
- [ ] Try `from=/historyXYZ` → it falls back, so the check is not a prefix test → AC-18
- [ ] Try `from=//evil.example.com` → it falls back, so a protocol relative address is refused by the leading slash rule → AC-18
- [ ] Try `from=/history?category=…&q=…` with real filters → it is accepted and the filters survive, so the check compares the path and not the whole string → AC-18

## Security

- [ ] Sign out and request `/history` directly → `proxy.ts` refuses it before the page renders → AC-19
- [ ] Search the feature's source for `user_id` → it appears nowhere → AC-19
- [ ] Search the feature's source for an insert, update, or delete → there are none → AC-19

## Accessibility

- [ ] Reach every filter control, the submit button, and every row's Edit link by keyboard alone, in a sensible order → AC-3, AC-16, AC-22
- [ ] Check each filter control has a real associated label, and that the field error on a bad range is linked to the field it belongs to → AC-9
- [ ] Confirm the results list carries a heading that names it, so it is distinguishable from the navigation list → AC-15
- [ ] Tab to the fifth nav tab and activate it → it reaches `/history` and is announced with its name and current state → AC-22
- [ ] Check the phone bottom bar and the desktop rail at five items → nothing overlaps, no label is clipped, and every target stays large enough to hit → AC-22
- [ ] Run the axe check against `/history` in both themes → no violations → AC-22

## What the build turned up

_Added after `/develop`. These are things the acceptance criteria could not have known to ask for, found while building._

- [ ] Log a note containing a literal `*`, then search `*` → note what happens. It currently behaves as a wildcard and matches everything, because PostgREST accepts `*` as an alias for `%` in an `ilike` pattern and rewrites it before SQL sees any escape. AC-4 named only `%`, `_`, and `\`, so this is an open decision rather than a bug to fix blind → AC-4, and the spec's follow up
- [ ] Count the live regions on `/history` in the accessibility tree → there must be exactly one. The dropped filter notice is deliberately not a live region: a second polite region competes with the confirmation region and is how an announcement gets silently dropped, which is what `MonthStatus` warns about → AC-17
- [ ] Submit the filter form with every field empty → the URL reads `?category=&from=&to=&q=`. That is a plain GET form doing what a GET form does, and the empty values parse back to no filters, so it is cosmetic. Confirm it stays cosmetic and never reads as an applied filter → AC-3
- [ ] Search for anything at all on an account whose entries have no notes → nothing matches, and that is correct rather than broken. The seeded test data has no notes, which is worth knowing before reading an empty result as a failure → AC-5
