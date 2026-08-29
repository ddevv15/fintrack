# 0010. Export and backup

**Date**: 2026-08-29
**Status**: Proposed

## Summary

You get two download links on your account screen: one for every transaction you have ever logged, one for every category you have made. Each is a CSV (a plain text table a spreadsheet opens by double clicking) built on the server and handed over as a file. Nothing is narrowed and nothing is sampled: an export is either the whole thing or it is an error you can read, never a short file that looks finished. The shared spend read in `lib/month.ts` grows one level more general so the export reads through the same definition every screen uses, which is what lets the file claim to match what the app shows.

## Requirements

**User stories**:

- As the person using FinTrack, I want every entry out of the app as a file so that months of typing are never trapped in one service.
- As the person using FinTrack, I want the file to open in a spreadsheet so that I can check the app's arithmetic against my own.
- As the person using FinTrack, I want to be sure the file is complete so that a backup I keep is a backup I can rely on.
- As the person using FinTrack, I want the export to work without JavaScript so that it is the least fragile thing in the app.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: Two downloads exist, one for transactions and one for categories, each a GET route reached by a plain link in an Export section on `/settings`. No JavaScript is required at any point. Each link is reachable by keyboard and its accessible name says what the file is, for example `Download your transactions as a CSV file`.
- **AC-2**: `transactions.csv` holds every transaction on the account: every direction, every category, hidden categories included, with no date bound, no category filter, and no text filter. There is no way to narrow it, because a backup that filters is not a backup.
- **AC-3**: `categories.csv` holds every category on the account: both kinds, hidden included, and categories no transaction has ever used.
- **AC-4**: `transactions.csv` carries a header row and exactly these columns in this order: `date`, `category`, `amount`, `currency`, `note`, `merchant`, `direction`, `id`, `category_id`, `created_at`. What a person reads is on the left and what a restore needs is on the right. `user_id` is not a column, in this file or the other one. A `note` or a `merchant` that was never filled in is written as an empty field, never as the word `null` and never quoted: the `undefined` a nullable column parses to becomes an empty string in one place, the row mapper, so `escapeCsvField()` only ever receives a string.
- **AC-5**: `categories.csv` carries a header row and exactly these columns in this order: `name`, `kind`, `color`, `hidden`, `id`, `created_at`. The `id` column is what makes `category_id` in the other file mean something, so the two files are a pair. `hidden` is written as `true` or `false`, and `color` is the stored token passed through unchanged, for example `green`, because that is what the app holds and what a reimport would need.
- **AC-6**: An amount is written as the plain decimal `formatAmountInput()` produces from the stored minor units, with no currency symbol and no thousands separator, and the ISO currency code goes in its own `currency` column. A two decimal currency writes `12.50` and a zero decimal one writes `1250`, because `formatAmountInput()` splits the digit string rather than dividing, which is exact every time. No other module converts an amount, and minor units never appear in the file.
- **AC-7**: `date` is the stored `occurred_on` written through unchanged as `YYYY-MM-DD`, because it is already a plain date and carries no timezone question. `created_at` is written as an ISO 8601 instant in UTC, so it restores to the same moment it was stored at, and is deliberately not converted into the profile timezone. The exact form is pinned rather than left to taste, because two implementations can each call themselves ISO 8601 and still disagree: it is `YYYY-MM-DDTHH:mm:ss.sssZ`, exactly what `Date.prototype.toISOString()` emits, the milliseconds and the trailing `Z` included.
- **AC-8**: Fields are quoted by RFC 4180. A field is wrapped in double quotes when, and only when, it contains a comma, a double quote, a carriage return, or a line feed; every double quote inside a wrapped field is written twice. The order is part of this criterion rather than implementation taste, because the wrong order passes a casual read: the inner quotes are doubled first and the wrapping quotes added after, since wrapping first would then double the wrapping quotes and corrupt every quoted field. The decision to quote and the doubling both live in one function, so no future column can be written unescaped.
- **AC-9**: A note or a merchant beginning with `=`, `+`, `-`, or `@` is written exactly as it was typed. No prefix, no quote, no tab is inserted to stop a spreadsheet treating it as a formula. The reasoning is recorded in [rationale.md](rationale.md) and it is a decision about this app's threat model, not an oversight.
- **AC-10**: The bytes are UTF-8 preceded by a byte order mark, and every record ends with a carriage return and a line feed, the last one included. Without the mark, Excel on Windows reads the file as its local codepage and turns an accented note into nonsense; RFC 4180 specifies the line ending.
- **AC-11**: The read asks Postgres for the exact count, then pages in reads of `EXPORT_PAGE_SIZE`, which is 1,000 rows, matching PostgREST's usual server side maximum so a page is never silently shortened beneath the reader. It then compares the number of rows received against the number the database reported, never against the length of the array it just built, which would compare a number with itself. A mismatch throws. Paging is by keyset, not by offset: each page asks for the rows ordered after the last `(occurred_on, created_at, id)` tuple it saw, with `id` present as the tie break that makes the order total. Offset paging is refused here specifically, because a row inserted or edited between two page reads shifts every later offset, which duplicates or skips a row while the total count stays the same, so the comparison in this criterion would pass over a file that is quietly wrong.
- **AC-12**: Nothing reaches the browser until the whole file is built and the count check has passed. A read that fails, or a count that does not match, produces an error response and never a file. The route never answers 200 with a short file, because a truncated `.csv` on disk looks exactly like a finished backup and there is nothing to notice. The error response is `text/plain; charset=utf-8` carrying one readable sentence, because the browser navigates straight to this URL and a JSON error object would land in front of a person as raw braces.
- **AC-13**: `MAX_EXPORT_ROWS` is 100,000 and bounds what the route will build in memory. A row costs roughly a kilobyte held as an object, so the ceiling is about a hundred megabytes, and twenty entries a day for ten years is 73,000 rows, which clears a decade of heavy use with room to spare. Above it the route answers 413 with a plain text sentence naming how many rows matched and what the limit is, and it never truncates to fit. The count is read before any paging begins, so a refusal costs one query rather than most of a file. A refusal you can read beats a hosting error page at the moment somebody is trying to get their data out.
- **AC-14**: An account with nothing logged downloads a valid CSV containing only the header row. An empty ledger is a true answer, and a header only file says what the columns would have been.
- **AC-15**: The filename is set by `Content-Disposition: attachment` as `fintrack-transactions-YYYY-MM-DD.csv` and `fintrack-categories-YYYY-MM-DD.csv`, where the day comes from `today()` in the profile's own timezone. Two exports on different days never overwrite each other, and they sort in order in a folder.
- **AC-16**: A signed out request to either route is refused by `proxy.ts` before the route runs, since neither path is public. Which rows exist at all is decided by row level security keyed to the signed in user id; no query in this feature names a `user_id`, and the column is in neither file.
- **AC-17**: The export reads through `lib/month.ts`, not around it. A new `readTransactionRange()` there takes a required `what` (the name that goes into a read failure message, which `readSpendRange()` needs today and must keep), an optional `direction`, and a keyset cursor, and `readSpendRange()` becomes a thin wrapper passing `direction: "spend"`. `tests/unit/month-window.test.ts` grows a fourth loader entry requiring `readTransactionRange`. One assertion in that file changes shape, and it is decided here rather than discovered mid build: its whole file check currently matches the literal `.eq("direction", "spend")`, and threading the direction through as a parameter deletes that literal from the file. It becomes two checks carrying the same guarantee, that `lib/month.ts` contains `.eq("direction", direction)` and that it contains the literal `direction: "spend"` inside `readSpendRange()`. Both `occurred_on` bounds and `count: "exact"` still appear exactly once and their assertions are untouched. A guard may change shape when the thing it guards changes shape; it may never be weakened to let a refactor through, and the guarantee is unchanged: one file still owns what a spend read is.
- **AC-18**: `/transactions`, `/breakdown`, and `/history` keep their exact current behaviour. `readSpendMonth()` still calls `assertCompleteMonthRead()` and still throws, and the month screens still refuse a month they cannot prove whole. This is a second extraction, not a relaxation.
- **AC-19**: The CSV writing is pure. Escaping a field, building a row, and assembling a document take values and return a string, with no backend, no request, and no clock, so all of AC-8, AC-9, and AC-10 are provable in unit tests.
- **AC-20**: This feature writes nothing. No migration, no table, no column, no insert, no update, no delete, and no record that an export happened.

## Decision

**Chosen option**: Option 2: two server built CSV downloads, read through a generalised range read, verified whole before a byte is sent.

Build export as two GET route handlers that page the whole table through one shared read, prove the result complete against the count Postgres reported, render it with a pure CSV writer, and hand it over as a named file attachment.

**Implementation skills**: `insforge` (`InsForge`, `~/.agents/skills/insforge/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No schema change. This feature adds no table, no column, no view, no trigger, and no migration. It reads three things that already exist:

| Table | Columns read | Why it is enough |
|---|---|---|
| `transactions` | `id`, `category_id`, `direction`, `amount_minor`, `occurred_on`, `merchant`, `note`, `created_at` | Every column the file carries. `transactions_owner_occurred_idx (user_id, occurred_on DESC, created_at DESC)` already gives the paging a stable order, which is what stops a row appearing twice or not at all across two pages |
| `categories` | `id`, `name`, `kind`, `color`, `is_hidden`, `created_at` | The whole of the second file |
| `profiles` | `currency`, `timezone` | Read through `getSettings()`, for the amount column and the filename only |

`user_id` is read by neither, and appears in neither file. It is the same value on every row, it is the one thing the app never names anywhere else, and putting it in a backup would make the file account specific for no gain.

**State transitions**: none. This feature reads and never writes.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/export/transactions` | GET | none | `text/csv; charset=utf-8` body, `Content-Disposition: attachment; filename="fintrack-transactions-YYYY-MM-DD.csv"` | Session, via `proxy.ts` | 500 on a read failure or a count mismatch · 413 when the count is above `MAX_EXPORT_ROWS` · both `text/plain`, one readable sentence |
| `/api/export/categories` | GET | none | The same, named `fintrack-categories-YYYY-MM-DD.csv` | Session, via `proxy.ts` | The same |
| `readTransactionRange(options)` | Server function, `lib/month.ts`, new | required `what`, `select`, `schema`, `limit`; optional `direction`, `start`, `endExclusive`, `categoryId`, `noteContains`, `after` (the keyset cursor, an `(occurred_on, created_at, id)` tuple), `order` | `{ rows, matched }` | Row level security | Throws on a read failure |
| `readSpendRange(options)` | Server function, `lib/month.ts`, becomes a wrapper | Unchanged from today | `{ rows, matched }` | Row level security | Throws on a read failure |
| `readSpendMonth(options)` | Server function, `lib/month.ts` | Unchanged from today | `Row[]` | Row level security | Throws on a read failure or an incomplete month |
| `escapeCsvField(value)` | Pure function, `lib/export.ts`, new | One field as a string | The field, quoted and doubled only when it has to be | none, pure | none |
| `toCsvDocument(header, rows)` | Pure function, `lib/export.ts`, new | A header row and the data rows | The whole document, byte order mark first, CRLF between records | none, pure | none |
| `loadAllTransactions()` | Server function, `lib/export.ts`, new | none | Every transaction, proved complete | Row level security | Throws on a read failure, a count mismatch, or a count above the ceiling |
| `loadAllCategories()` | Server function, `lib/export.ts`, new | none | Every category, proved complete | Row level security | The same |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Build `transactions.csv` | The rows | `transactions`, scoped by row level security, no direction filter, paged through `readTransactionRange()` |
| Build `transactions.csv` | The paging order | The database, `occurred_on DESC, created_at DESC, id DESC`, the first two matching `transactions_owner_occurred_idx` and `id` making the order total |
| Build `transactions.csv` | Where the next page starts | The `(occurred_on, created_at, id)` tuple of the last row of the previous page, a keyset cursor, never an offset |
| Build `transactions.csv` | The number of rows that should arrive | The exact count PostgREST reports for the same read, never `rows.length` |
| Build `transactions.csv` | The `amount` column | `formatAmountInput(amount_minor, currency)` in `lib/money.ts`, the only module allowed to convert an amount |
| Build `transactions.csv` | The `currency` column, and the decimals the amount is written to | `getSettings()`, the profile's `currency`, through `decimalsFor()` inside `formatAmountInput()` |
| Build `transactions.csv` | The `date` column | The stored `occurred_on`, written through unchanged; it is already a plain date |
| Build `transactions.csv` | The `created_at` column | The stored timestamp as an ISO 8601 UTC instant, deliberately not converted to the profile timezone |
| Build `transactions.csv` | The `category` column | The joined `categories.name`, through the existing embedded select |
| Build `transactions.csv` | Whether a field is quoted | `escapeCsvField()`, from the field's own characters, per AC-8 |
| Build `transactions.csv` | An absent `note` or `merchant` | The empty string, substituted in the row mapper before escaping, so a nullable column never reaches the writer as `undefined` |
| Build `categories.csv` | The `color` column | The stored `color` token, passed through unchanged |
| Either route | The error or refusal body | A plain text sentence built in the route, `text/plain; charset=utf-8`, never JSON |
| Build `categories.csv` | The `hidden` column | The stored `is_hidden`, written as `true` or `false` |
| Either route | The filename's date | `today()` in `lib/time.ts`, given the profile's `timezone` from `getSettings()`, never the server clock |
| Either route | Whether the file may be sent at all | The completeness comparison in `loadAll*()`, and the `MAX_EXPORT_ROWS` ceiling |

**Key invariants**:

- One definition of a transaction read. `readTransactionRange()` in `lib/month.ts` is the only place a `direction` filter, an `occurred_on` bound, or `count: "exact"` is written. `tests/unit/month-window.test.ts` fails if the export loader writes any of them itself.
- The month read is unchanged in behaviour. `readSpendMonth()` still calls `assertCompleteMonthRead()` and still throws. Two extractions have moved this code now, and neither has relaxed a guard.
- A file is either provably whole or absent. There is no third state, and no partial file with a 200 beside it.
- The reported count is produced by the database, never by measuring the array that was just received.
- Paging is by keyset over a total order, never by offset, so a write landing between two pages cannot duplicate or skip a row behind the count check's back.
- The file is built entirely before the response begins, so a failure can still become an error rather than a truncated download.
- Nothing here writes, and nothing here names a `user_id`.

**Security model**:

Read only, for the signed in person only, over their own records. Which rows exist at all is decided by the existing row level security policy keyed to `auth.uid()`, exactly as every other read in the app does it, and no query in this feature names a `user_id`. Three surfaces need care:

- Neither route path is on `proxy.ts`'s public list or its infrastructure prefixes, so a signed out request is redirected to `/sign-in` before the handler runs. This is worth stating rather than assuming, because a route handler is a new kind of surface for this app and the two that exist are both deliberately exempt.
- The file contains the whole of a person's financial history in plain text and lands in their downloads folder. That is the point of the feature, and it is the person's own data on their own device, so no new control is added. It is named here so nobody later reads the absence as an oversight.
- A note is written into the file exactly as typed, formula characters included. The only thing that can write a note in this app is the account owner, so the usual spreadsheet formula mitigation defends against nobody and costs a file that no longer matches the app. If anything else ever writes a note, an import, a shared account, a merchant feed, this decision has to be revisited, and AC-9 is where to start.

No compliance scope applies: this is a single person's own financial records, handed to them, with no third party in the path.

**Configuration required**: none. No new environment variable, no new credential, no new service, and no new dependency.

**Critical test scenarios**:

- Happy path: log spends across several months, download `transactions.csv`, and every entry is there with the amounts matching what the app shows, verifies **AC-2**, **AC-6**.
- Escaping: a note containing a comma, a note containing a double quote, and a note containing a line break each survive a round trip through a spreadsheet unchanged, verifies **AC-8**.
- Formula: a note reading `=1+1` comes out of the file as `=1+1`, verifies **AC-9**.
- Encoding: a note with an accented character opens correctly in Excel by double click, verifies **AC-10**.
- Completeness: with more rows than one page holds, the file still contains every row and the count matches, verifies **AC-11**.
- Failure case: a read that comes back short produces an error and no file at all, not a partial download, verifies **AC-12**.
- Overflow: an account above `MAX_EXPORT_ROWS` gets a refusal naming the count and the limit, and no truncated file, verifies **AC-13**.
- Empty: a brand new account downloads a header only file that a spreadsheet opens, verifies **AC-14**.
- Auth: a signed out request to either route lands on `/sign-in` and never reaches the handler, verifies **AC-16**.
- Concurrency: a transaction inserted while an export is paging cannot make a row appear twice or vanish, because the cursor is a value and not a position, verifies **AC-11**.
- No count: a read that comes back without a reported count throws rather than sending whatever arrived, the same refusal `assertCompleteMonthRead()` makes, verifies **AC-11**, **AC-12**.
- Regression: the month invariant suite and all three money screens behave identically after the second extraction, verifies **AC-17**, **AC-18**.

## Build plan

Sliced by the project's Skateboard approach. Slice 1 is the thinnest export you would genuinely trust, which is the transactions file with its completeness guarantee, and it ships on its own. The honesty parts are not deferred: a download that cannot prove itself whole is worse than no download, so the count check and the ceiling are in the first slice, not a later one. The extraction leads because everything stands on it.

1. Generalise the read in `lib/month.ts`: add `readTransactionRange()` taking a required `what`, an optional `direction`, and an optional `after` keyset cursor, returning the same `{ rows, matched }`, then make `readSpendRange()` a thin wrapper passing `direction: "spend"`. `readSpendMonth()` keeps calling `assertCompleteMonthRead()` untouched. Extend `tests/unit/month-window.test.ts` with a fourth loader entry requiring `readTransactionRange`, and change the one whole file assertion to the two checks AC-17 fixes, satisfies **AC-17**, **AC-18**.
2. Write the pure half of `lib/export.ts`: `escapeCsvField()` with the doubling before the wrapping, `toCsvDocument()` adding the byte order mark and the CRLF endings, and unit tests covering a comma, a quote, a line break, a leading `=`, an accented character, and an empty document, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-19**.
3. Add `loadAllTransactions()` on top of `readTransactionRange()`: read the count first and refuse above `MAX_EXPORT_ROWS` (100,000) before any paging begins, then page by keyset in reads of `EXPORT_PAGE_SIZE` (1,000) ordered `occurred_on DESC, created_at DESC, id DESC`, compare the rows received against the reported count, and throw on a mismatch or on a missing count, satisfies **AC-2**, **AC-11**, **AC-12**, **AC-13**, **AC-20**.
4. Map a stored row to a file row: the ten columns in order, the amount through `formatAmountInput()` with the profile currency, `occurred_on` through unchanged, `created_at` as an ISO 8601 UTC instant, satisfies **AC-4**, **AC-6**, **AC-7**.
5. Build `app/api/export/transactions/route.ts`: build the whole document, then answer with `text/csv; charset=utf-8` and the `Content-Disposition` filename from `today()` in the profile timezone. A header only document for an empty account, satisfies **AC-1**, **AC-14**, **AC-15**, **AC-16**.
6. Add the Export section to `/settings` with a plain link, its accessible name, and a line saying what the file contains, satisfies **AC-1**.
   _Slice 1 ends here: you can take your whole ledger out of the app, and it is either complete or an honest error._
7. Add `loadAllCategories()`, the second route, and its link, with the six columns in order and `is_hidden` written as `true` or `false`, satisfies **AC-3**, **AC-5**.

## Consequences

**Positive**:

- Your data stops being trapped. One click and a spreadsheet opens everything you have ever logged, which is the promise the scope makes.
- One definition of a transaction read now serves every screen and the export, and the invariant test covers four loaders instead of three, so the guard got stronger rather than being worked around.
- No migration, no new dependency, no new environment variable, and no new service. The whole feature is application code over a table that already exists.
- The download works with JavaScript switched off, which makes it the most robust path in the app, which is the right property for the thing you reach for when something has gone wrong.
- The completeness rule is the same one the money screens already rest on, so there is one idea to understand rather than two.

**Negative and tradeoffs**:

- One assertion in `tests/unit/month-window.test.ts` changes shape, which is the thing to watch hardest in review. AC-17 fixes what it becomes and why the guarantee survives, but a changed guard is how a real invariant quietly stops being enforced, so it deserves a second pair of eyes rather than a nod.
- `lib/month.ts` is edited a second time, and four accepted specs now depend on its behaviour. It is an extraction again rather than a rewrite, and the invariant suite plus the three money screens are the check, but this is the riskiest part of the build and it is first for that reason.
- The file is built entirely in memory before it is sent, so the export is bounded by what one request can hold. `MAX_EXPORT_ROWS` makes that bound visible and refusable rather than a crash, but it is a real ceiling and somebody will eventually meet it.
- Two downloads mean two clicks, and a person who takes only the first has a backup missing every category they never spent under.
- A note beginning with a formula character will execute when the file is opened in a spreadsheet. That is a considered decision for this threat model, and it is the kind of decision that ages badly if the threat model changes quietly.
- The module is still called `lib/month.ts` while holding a read that has nothing to do with months. Spec 0009 already noted this drift; this spec widens it.

**Neutral**:

- `MAX_EXPORT_ROWS` is a memory bound on one response and is deliberately neither `MAX_MONTH_ROWS` nor `MAX_HISTORY_ROWS`. Three numbers with three reasons, and the reasons belong next to them in the code.
- The export reads every direction, so it is already correct on the day feature 14 adds income, without anyone remembering to come back here.
- There is no import. Reading a file back into the app is a separate feature with its own correctness surface, and nothing here forecloses it: the id columns are in the files precisely so it stays possible.

## Follow-up

- [ ] `lib/month.ts` now holds the general transaction read that every screen and the export share. Its name has outgrown it. Renaming it touches every import, so it wants its own small change rather than riding along with a feature.
- [ ] An import that reads these files back in, which is what turns an export into a real backup. The id columns exist for it; the merge rules, the duplicate handling, and what happens to a category that no longer exists are all undecided.
- [ ] Measure where the memory ceiling actually falls on the hosting plan in use, and set `MAX_EXPORT_ROWS` from that measurement rather than from an estimate.
- [ ] Streaming, if the ceiling ever becomes a real limit. It costs the guarantee in AC-12, so it needs a way to signal a truncated download that a downloads folder can actually show.
- [ ] Decide whether Settings should say when you last took a backup. It was considered and declined here because it would make a read path write, but it is the kind of nudge that makes a backup habit stick.
- [ ] Revisit AC-9 if anything other than the account owner can ever write a note or a merchant.
