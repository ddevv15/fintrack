# 0009. Search and filter your history

**Date**: 2026-08-28
**Status**: In Progress

## Summary

You get a new screen at `/history` that looks across every month rather than just this one. You can narrow it by one category, by a from date and a to date, and by text you typed in a note, in any combination. All of it lives in the address bar, so a reload, a bookmark, and the back button all bring the same results back, and the page stays server rendered with no JavaScript needed. Nothing is added to the database: the two indexes this needs were built in spec 0002. The one piece of existing code that changes is `lib/month.ts`, which grows a general range read that the month read becomes a thin wrapper over, so the month screens and this one can never disagree about a stretch of time they both cover.

## Requirements

**User stories**:

- As the person using FinTrack, I want to find one specific charge I half remember so that I can check it or correct it without scrolling through months.
- As the person using FinTrack, I want to see one category over a stretch of months so that I can tell whether a habit is growing.
- As the person using FinTrack, I want my filters to still be there after a reload so that refreshing the page does not throw away what I set up.
- As the person using FinTrack, I want to be told when a result set is too big to total so that I never read a number that is only part of the answer.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/history` lists spend entries across all time, newest first, with entries on the same day ordered most recently created first. The ordering is done by the database through `transactions_owner_occurred_idx`, never in TypeScript.
- **AC-2**: Four filters exist, each optional and each usable alone or in any combination: one category, a from date, a to date, and a note text term. With none set, the screen shows the newest entries across all time.
- **AC-3**: Every filter is carried in the URL query string. A reload, a bookmark, and the back and forward buttons all reproduce the same result set. The page is a Server Component and the controls are a plain `<form method="get">`, so no JavaScript is required and no filter state lives in a client component.
- **AC-4**: The note term matches case insensitively anywhere inside the note, so `cof` finds `coffee refill`. The LIKE metacharacters in the typed term are escaped before the query is built, so a person typing `%` matches a literal percent sign rather than every row. Two things about the order are part of this criterion rather than implementation taste, because a plausible wrong order passes a casual read and breaks the search: the backslash is escaped first and `%` and `_` after it, since doing it the other way round double escapes the backslashes the first two substitutions just introduced; and the surrounding `%` wildcards that make this a contains search are added after escaping, never before, or the wildcards themselves get escaped and the search silently becomes an exact match. The escaping happens inside the shared read, not in a caller, so no future caller can forget it.
- **AC-5**: The note term is matched against the `note` column only. A category is matched by the category filter, never by the text box, so every result is explained by something visible in its own row.
- **AC-6**: The category picker offers every one of the person's spend categories, name ascending, with all hidden ones included, each labelled for example `Coffee (hidden)` and keeping its alphabetical position. This is a broader rule than spec 0007 AC-12, which admits only the edited entry's own hidden category, so the two share the labelling and the alphabetical position convention and nothing else. No existing helper returns this set: `listSpendCategories()` omits hidden ones, `listSpendCategoryOptions()` needs an entry id and admits exactly one hidden one, and `listManagedCategories()` returns the right set but pays for a second read of usage counts this screen has no use for. A new one is added.
- **AC-7**: Results are never filtered by category visibility. A spend filed under a hidden category still appears in the list and still counts toward a total, because money you spent counts whatever you later did with the label.
- **AC-8**: The to date is inclusive as typed, so a to of `2026-08-19` includes entries occurring on the 19th. It is converted exactly once into the half open `endExclusive` bound the shared read takes, so the query shape stays identical to the month read and no comparison operator is written twice. The conversion is a new `dayAfter()` in `lib/time.ts`, built from the same `parseISO` then `addDays` then `format` idiom `monthRange()` already uses, because `AGENTS.md` makes that module the owner of date maths and an off by one day is the easiest bug to introduce here.
- **AC-9**: A from date later than the to date is refused with a field error naming the problem, and no query runs. An impossible range never renders as an empty result.
- **AC-10**: The screen renders at most 200 rows. When more match, it states how many, for example `Showing the newest 200 of 1,340 matches`, using the exact count Postgres reported for the same filter, not a number counted from the array it just built. The count is formatted with `Intl.NumberFormat` at `en-US`, the same hardcoded locale `lib/time.ts` already uses, because this is the first plain integer in the app to carry a thousands separator and an unformatted five figure count is hard to read at a glance.
- **AC-11**: A total for the filtered set is shown only when the set is provably complete, meaning the rows received equal the exact count reported. It is summed in a single pass over exactly the rows rendered, never by a second query. When the set is capped, no total is shown at all and a line says to narrow the filters to see one. A partial total is never shown, and a zero is never shown in place of one.
- **AC-12**: A read that fails throws and reaches the route error boundary. The screen never renders a shortened list, a zero, or a partial total in place of an error.
- **AC-13**: A query parameter that cannot be parsed is dropped, the remaining filters still apply, and the page names which filter was dropped and why. This covers a malformed date, a category id that is not a uuid, a category id that is not one of yours, and a note term longer than the 500 character note column can hold. Deciding that last case needs the person's own category list, so the list is passed into the parsing function as an argument rather than read inside it. The function stays pure and every dropped filter, ownership included, comes back through the one list it already returns. Dropping one silently is forbidden, because a dropped bound widens the range and would put a confident total against a question that was never asked.
- **AC-14**: The three empty outcomes are distinguishable in words, never one shared message: you have logged nothing at all yet, your filters matched nothing, and your range was refused as impossible.
- **AC-15**: Each row shows the date, the category name with its colour chip, the amount, and, when there is one, the note as a subtitle truncated to a single line by CSS so the full text stays in the DOM for a screen reader. The amount never wraps, shrinks, or truncates.
- **AC-16**: Each row offers an Edit action reaching `/transactions/[id]/edit`, reachable by keyboard, with short visible text and an accessible name identifying the entry, for example `Edit 12.50 Groceries, Aug 19`. There is no Delete on this screen.
- **AC-17**: An edit opened from `/history` returns to `/history` with the same filters still applied, and the confirmation naming what was actually stored appears there exactly once. It is never in the URL, and it never comes back on a reload, a bookmark, or the back and forward buttons.
- **AC-18**: The return destination is validated before it is used, and the check is specified here rather than left as an allow list, because the value carries a query string and the two obvious checks are both wrong: exact membership in a two item list never matches `/history?category=…`, and a `startsWith` test wrongly accepts `/historyXYZ`. The value is refused unless it begins with a single `/`, which rejects an absolute URL and a protocol relative `//host` in one step. It is then parsed with a fixed internal base, and its pathname alone must equal `/history` or `/transactions` exactly. Only a value passing both steps is navigated to; anything else falls back to `/transactions`.
- **AC-19**: This feature never names a `user_id` and never writes anything. Ownership is decided by row level security. A category id belonging to another account is indistinguishable from one that never existed, and both are reported as a dropped filter.
- **AC-20**: The month read keeps its exact current behaviour. `readSpendMonth()` still compares rows received against the reported count and still throws on a mismatch, so `/transactions` and `/breakdown` continue to refuse a month they cannot prove whole. The change is an extraction, not a relaxation.
- **AC-21**: `/history` filtered to exactly the current month with no other filter shows the same total as `/transactions` shows for that month, because both are computed from the same shared read and the same single pass sum.
- **AC-22**: A fifth navigation tab reaches `/history`. It is reachable by keyboard and announced correctly, and the bottom bar on a phone and the rail on a desktop both still work at five items.

## Decision

**Chosen option**: Option 2: a separate `/history` screen reading through a generalised range read in `lib/month.ts`.

Build `/history` as its own server rendered screen whose filters live entirely in the URL, reading through a new `readSpendRange()` in `lib/month.ts` that `readSpendMonth()` becomes a thin wrapper over, so one definition of a spend read serves every screen.

**Implementation skills**: `insforge` (`InsForge`, `~/.agents/skills/insforge/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No schema change. This feature adds no table, no column, no view, no trigger, and no migration. It reads three things that already exist:

| Table | Columns read | Why it is enough |
|---|---|---|
| `transactions` | `id`, `amount_minor`, `occurred_on`, `note`, `direction`, `category_id` | `transactions_owner_occurred_idx (user_id, occurred_on DESC, created_at DESC)` already serves the range plus ordering, and `transactions_owner_category_idx (user_id, category_id)` already serves the category filter |
| `categories` | `id`, `name`, `color`, `is_hidden` | The picker and the row chip, joined through the existing embedded select |
| `profiles` | `currency` | Read through `getSettings()`, for rendering amounts only |

The note text search runs as an unindexed `ILIKE '%term%'`. At a personal scale of a few thousand rows this is a sequential scan over an already narrowed set, which is not a measured problem. A trigram index is the answer if it ever becomes one, and it is recorded as a follow up rather than bought in advance.

**State transitions**: none. This feature reads and never writes.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/history` | Page, Server Component | `searchParams`: `category` (uuid, opt), `from` (`YYYY-MM-DD`, opt), `to` (`YYYY-MM-DD`, opt), `q` (text, opt) | Rendered list, match count, total when complete, dropped filter notices | Session, via the `(app)` layout and `proxy.ts` | Read failure throws to `app/error.tsx` |
| `parseHistoryFilters(searchParams, categoryOptions)` | Pure function, `lib/history.ts` | The raw search params, plus the person's spend categories so an unknown or foreign category id can be recognised without a query | `{ filters, dropped[], rangeError }` | none, pure | Never throws; returns what it could not parse |
| `resolveReturnPath(value)` | Pure function, `lib/history.ts` | The raw `from` value | The validated internal path, or `/transactions` | none, pure | Never throws |
| `listSpendCategoryFilterOptions()` | Server function, `lib/categories.ts`, new | none | Every spend category, hidden included, name ascending, in one read | Row level security | Throws on a read failure |
| `dayAfter(day)` | Pure function, `lib/time.ts`, new | A `PlainDate` | The next calendar day as a `PlainDate` | none, pure | Throws on a malformed date, as its neighbours do |
| `loadHistory(filters)` | Server function, `lib/history.ts` | Parsed filters | `{ rows, matched, totalMinor, isComplete }` | Row level security | Throws on a read failure |
| `summariseHistory(rows, matched)` | Pure function, `lib/history.ts` | Rows and the reported count | `{ rows, totalMinor, isComplete }` | none, pure | none |
| `readSpendRange(options)` | Server function, `lib/month.ts` | `select`, `schema`, optional `start` and `endExclusive`, optional `categoryId`, optional `noteContains`, `limit`, `order` | `{ rows, matched }` | Row level security | Throws on a read failure |
| `readSpendMonth(options)` | Server function, `lib/month.ts` | Unchanged from today | `Row[]` | Row level security | Throws on a read failure or an incomplete month |
| `/transactions/[id]/edit?from=…` | Page, existing, one change | `from`: an internal list route | Existing edit form, returning to the validated route | Session | Unknown id renders not found, unchanged |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Render `/history` | The result rows | `transactions`, scoped by row level security, `direction = 'spend'` filtered inside `readSpendRange()` |
| Render `/history` | Row order | The database, `occurred_on DESC, created_at DESC`, matching `transactions_owner_occurred_idx` |
| Render `/history` | The category filter value | The `category` search param, checked against the person's own category list before use |
| Render `/history` | The from and to bounds | The `from` and `to` search params, parsed as `PlainDate` |
| Render `/history` | The `endExclusive` bound the query uses | `dayAfter()` in `lib/time.ts`, applied once to the typed `to`, so the inclusive to date becomes the half open bound `readSpendRange()` takes |
| Render `/history` | The note term actually sent to Postgres | The `q` search param, trimmed, then escaped inside `readSpendRange()` in the order AC-4 fixes, then wrapped in the contains wildcards |
| Render `/history` | The match count in `newest 200 of N` | The exact count PostgREST reports for the same filter, never `rows.length` |
| Render `/history` | Whether the set is complete | `rows.length === matched`, the same independent comparison `assertCompleteMonthRead()` makes |
| Render `/history` | The total, when shown | Summed in one pass over exactly the rows rendered, in `summariseHistory()` |
| Render `/history` | The currency the amounts are formatted in | `getSettings()`, the profile's `currency`, read on the server |
| Render `/history` | The category options, including hidden ones | `listSpendCategoryFilterOptions()`, new in `lib/categories.ts`; no existing helper returns this set, see AC-6 |
| Render `/history` | Which filters were dropped | `parseHistoryFilters()`, returned alongside the filters rather than logged or swallowed. The category ownership case is decided from the list passed into it, so every drop reason comes from one place |
| Render `/history` | The formatted match count | `Intl.NumberFormat` at `en-US`, the locale already hardcoded in `lib/time.ts` |
| Render `/history` | Which of the three empty messages is shown | The parse result and the read together: a range error present means the refused range; otherwise no rows with no filter active means nothing logged yet; otherwise no rows means the filters matched nothing |
| Render `/history` | A row's Edit accessible name | Composed from the row's own amount, category name, and date, the same composition spec 0007 AC-8 uses on `/transactions` |
| Edit from `/history` | The return destination | The `from` param on the edit URL, put through `resolveReturnPath()` on the server before it is passed to the form, never used raw |
| Edit from `/history` | The confirmation sentence | `updateTransaction()`, unchanged, handed over in memory through `components/transactions/confirmation.ts` |

**Key invariants**:

- One definition of a spend read. `readSpendRange()` in `lib/month.ts` is the only place `direction = 'spend'`, an `occurred_on` bound, or `count: "exact"` is written. `tests/unit/month-window.test.ts` fails if a loader writes any of them itself.
- The month read is unchanged in behaviour. `readSpendMonth()` still calls `assertCompleteMonthRead()` and still throws. The extraction moves code, it does not relax a guard.
- A total is either provably whole or absent. There is no third state and no zero standing in for one.
- The reported count is produced by the database, never by measuring the array that was just received.
- Nothing here writes, and nothing here names a `user_id`.

**Security model**:

Read only, for the signed in person only. Which rows exist at all is decided by the existing row level security policy keyed to `auth.uid()`, exactly as the month read does it, and no query in this feature names a `user_id`. Three specific surfaces need care:

- A `category` param that belongs to another account returns nothing under row level security. It is reported as a dropped filter, the same as a category id that never existed and the same as a malformed one, so the three stay indistinguishable, matching spec 0007 AC-15.
- The URL carries a note term the person typed. That is accepted deliberately. The reasoning, and why spec 0007 AC-13 does not forbid it, is in [rationale.md](rationale.md).
- The `from` param on the edit URL is a navigation target taken from a query string, which is an open redirect if used unchecked. It is validated against an allow list of two internal routes before use, and anything else falls back to `/transactions`.

No compliance scope applies: this is a single person's own financial records, shown only to them, with no third party in the path.

**Configuration required**: none. No new environment variable, no new credential, no new service.

**Critical test scenarios**:

- Happy path: log spends across three months, open `/history`, filter to one category with a from and a to date, and get exactly the expected rows newest first with a total above them, verifies **AC-1**, **AC-2**, **AC-11**.
- Persistence: set all four filters, reload, then press back and forward, and the same result set returns each time, verifies **AC-3**.
- Escaping: log a note containing a literal `%`, search for `%`, and get only that entry rather than everything, verifies **AC-4**.
- Boundary: with an entry on the to date exactly, that entry is included, verifies **AC-8**.
- Overflow: with more matches than the cap, the count line appears, the total does not, and the explanation says why, verifies **AC-10**, **AC-11**.
- Agreement: `/history` filtered to exactly the current month reports the same total as `/transactions`, verifies **AC-21**.
- Failure case: a malformed `from` and a stranger's `category` in the URL both render the page with the remaining filters and a notice naming what was dropped, and never an error page, verifies **AC-13**, **AC-19**.
- Refusal: a from later than the to shows a field error and no results list, distinct from the no matches empty state, verifies **AC-9**, **AC-14**.
- Round trip: edit an entry reached from a filtered `/history`, save, and land back on `/history` with the filters intact and the confirmation shown once, verifies **AC-17**.
- Auth: a signed out request to `/history` is refused by `proxy.ts` before the page renders, verifies **AC-19**.
- Regression: the existing month invariant suite and both month screens behave identically after the extraction, verifies **AC-20**.

## Build plan

Sliced by the project's Skateboard approach: slice 1 is the thinnest `/history` you would genuinely use, and it ships on its own. Each later slice adds one capability and is shippable by itself. The extraction leads because everything else stands on it, and the invariant scan is extended in the same slice that creates the second reader, so the two can never drift even briefly.

1. [x] Extract `readSpendRange()` in `lib/month.ts` with optional `start`, `endExclusive`, `categoryId`, and `noteContains`, a required `limit`, and a `{ rows, matched }` return. Escape the note term here, backslash first and then `%` and `_`, and add the contains wildcards only after escaping. Make `readSpendMonth()` a thin wrapper that passes the month window and `MAX_MONTH_ROWS`, then calls `assertCompleteMonthRead()` exactly as it does today, satisfies **AC-4**, **AC-20**.
2. [x] Extend `tests/unit/month-window.test.ts`. Its `LOADERS` entries currently carry only a file and a loader name while the assertions hardcode the same two strings for every entry, so add a `requires: readonly string[]` field per entry: the two month loaders require `currentSpendMonth(` and `readSpendMonth`, and the history loader requires `readSpendRange`. The hand written filter scan and the whole file check both apply unchanged, and the whole file check keeps passing because those literals stay in `lib/month.ts` even once the bounds are applied conditionally, satisfies **AC-20**.
3. [x] Add `dayAfter()` to `lib/time.ts`, using the same `parseISO` then `addDays` then `format` idiom `monthRange()` uses, with the same malformed input guard its neighbours have, satisfies **AC-8**.
4. [x] Add `listSpendCategoryFilterOptions()` to `lib/categories.ts`: every spend category, hidden included, name ascending, in a single read with no usage counts. It sits beside the three existing list helpers, none of which returns this set, satisfies **AC-6**.
5. [x] Write `lib/history.ts`: the pure `parseHistoryFilters(searchParams, categoryOptions)` returning filters, dropped filter reasons, and a range error, applying `dayAfter()` once to the typed `to`, and recognising a category id that is not one of yours from the list it was handed. Add the pure `resolveReturnPath()` with the leading slash refusal and the pathname equality check. Add the pure `summariseHistory()`. Cover all three with unit tests that need no backend, including the escaping order and both wrong redirect shapes, satisfies **AC-2**, **AC-8**, **AC-9**, **AC-13**, **AC-18**.
6. [x] Add `loadHistory()` in `lib/history.ts` on top of `readSpendRange()` with `MAX_HISTORY_ROWS = 200`, returning rows, the reported count, and whether the set is complete, satisfies **AC-1**, **AC-7**, **AC-10**, **AC-12**, **AC-19**.
7. [x] Build `/history` as a Server Component: load the category options first, since both the picker and the parsing need them, then the `<form method="get">` with the category select, the two date inputs, and the text field, the results list reusing the existing row primitives, the three distinct empty states chosen by the predicate in the Value sourcing table, and the dropped filter notices, satisfies **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-13**, **AC-14**, **AC-15**.
8. [x] Add the fifth nav tab in `components/ui/AppShell.tsx` and its icon in `AppNav`'s exhaustive icon map, and check the bar and the rail at five items, satisfies **AC-22**.
   _Slice 1 ends here: `/history` lists and filters across all time and is worth shipping on its own._
9. [x] Add the match count line, formatted with `Intl.NumberFormat` at `en-US`, and the conditional total shown only when rows received equal the reported count, with the explanation when it is withheld, satisfies **AC-10**, **AC-11**, **AC-21**.
10. [x] Add the Edit action to each history row, with an accessible name composed the way spec 0007 AC-8 composes it, linking to the edit screen with a `from` param carrying the current filtered URL, satisfies **AC-16**.
11. [x] Teach the edit screen its return destination: run `from` through `resolveReturnPath()` on the server, pass the validated path into `EditSpendForm`, and have it push there instead of the hardcoded `/transactions`. Give `/history` a status region so the handed over confirmation is announced and focusable there too, satisfies **AC-17**, **AC-18**.

## Consequences

**Positive**:

- One definition of a spend read now serves every screen in the app, and the invariant test covers three loaders instead of two, so the guard got stronger rather than being worked around.
- No migration, no new dependency, no new environment variable, and no new service to operate. The whole feature is application code over indexes that already exist.
- The screen works with JavaScript disabled and renders money entirely on the server, so no amount reaches the browser as data.
- Filters are shareable and bookmarkable for free, and back and forward behave the way a browser is supposed to.
- The conditional total is genuinely new honesty: the app can now answer what you spent on one category over a stretch, and says plainly when it cannot rather than guessing.

**Negative and tradeoffs**:

- `lib/month.ts` is edited, and three accepted specs depend on its behaviour. The change is an extraction rather than a rewrite, and the existing invariant suite plus both month screens are the check, but this is the riskiest part of the build and it is first for that reason.
- What you typed into the note search appears in the address bar, in browser history, and in a bookmark. On a shared or borrowed device that is visible. This is a deliberate tradeoff, not an oversight.
- The unindexed note search will slow down eventually. The point at which it matters is unknown and unmeasured, so nothing is built for it yet.
- A fifth navigation tab crowds the phone bottom bar and shortens every label.
- The edit screen gains a return destination and therefore an open redirect surface that has to be validated. It is one small allow list, but it is one more thing that must not be got wrong.
- Two screens now list transactions with slightly different affordances, one with Edit and Delete and one with Edit only. That difference has to be explainable, or it reads as a bug.

**Neutral**:

- `MAX_HISTORY_ROWS` is a rendering bound and is deliberately not `MAX_MONTH_ROWS`, which is a memory bound on a month. Two numbers with two reasons, and the reasons belong next to them in the code.
- The `merchant` column stays unread and unwritten. Search covers the note only until something writes a merchant.
- Income is out of scope. The shared read filters `direction = 'spend'` as it always has, so feature 14 will have to decide what history means once money coming in exists.

## Follow-up

- [ ] AC-4 names `%`, `_`, and `\` as the metacharacters to escape, and the build found a fourth at the transport layer: PostgREST accepts `*` as an alias for `%` in an `ilike` pattern, so a typed `*` still behaves as a wildcard. It cannot be escaped, because PostgREST rewrites `*` to `%` before SQL sees the backslash. Decide whether to accept `*` as a wildcard and say so in the hint, or move the match to a regex operator that has no such rewrite.

- [ ] Consider a `pg_trgm` index on `note` if the text search becomes slow in real use. Measure before building it; a personal ledger may never reach the size where it matters.
- [ ] Date range presets, for example last three months or this year, computed in the person's own timezone. Deferred because each preset is its own small correctness surface and the two date inputs already satisfy the requirement.
- [ ] Several categories at once, rather than one. Deferred because a correct multi select is real accessibility work and the single select answers the stated job.
- [ ] `components/transactions/confirmation.ts` and `MonthStatus.tsx` now have a second caller. Spec 0007's follow up said to promote them when a third appears. `/history` is the second, so revisit at the next one, and note that `MonthStatus` has outgrown its name.
- [ ] Decide what `/history` means once income exists in feature 14, since the shared read is spend only by construction.
- [ ] The match count is the first plain number in the app to be formatted for reading, and it hardcodes `en-US` like everything else. Fold it into the existing open question `lib/time.ts` records: the profile carries a currency and a timezone but no locale, and nothing yet decides where a locale would come from.
