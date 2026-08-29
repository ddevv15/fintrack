# Verify: Export and backup · spec 0010 · written 2026-08-29

_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Nothing here is ticked yet: the feature is not built. Steps that a test should own once it exists are marked **(auto target)** with the suggested test name.

## The extraction, before anything else

- [ ] Run the existing suites after `readTransactionRange()` lands and before either route exists → `tests/unit/month-window.test.ts` passes unchanged → AC-18
- [ ] Open `/transactions`, `/breakdown`, and `/history` → all three show the same totals they showed before the extraction → AC-18
- [ ] Break the read deliberately on a scratch branch so fewer rows come back than the count reports → both month screens still refuse to render and show the error page → AC-18 (auto target: `month-window.test.ts`)
- [ ] Read `lib/month.ts` → both `occurred_on` bounds and `count: "exact"` each still appear exactly once in the file, and their assertions in the test are untouched → AC-17
- [ ] Read `lib/month.ts` → it contains `.eq("direction", direction)`, and the literal `direction: "spend"` sits inside `readSpendRange()` → AC-17
- [ ] Read the diff of `tests/unit/month-window.test.ts` → the one changed assertion is the direction pair AC-17 names, and no other assertion was loosened, removed, or made narrower to let the refactor through → AC-17
- [ ] Read `readTransactionRange()` → it takes a required `what`, and a read failure message still names the read it came from → AC-17
- [ ] Read `tests/unit/month-window.test.ts` → a fourth loader entry exists for the export, requiring `readTransactionRange` → AC-17
- [ ] Search `lib/export.ts` for a direction filter, an `occurred_on` bound, or `count: "exact"` → none of them is written there → AC-17

## Getting a file at all

- [ ] Open `/settings` → an Export section is there, with a link for transactions and a link for categories → AC-1
- [ ] Tab to each link → both are reachable by keyboard, in a sensible order → AC-1
- [ ] Read each link's accessible name → it says what the file is, not just "download" → AC-1
- [ ] Click the transactions link → a file downloads rather than the browser showing it → AC-1
- [ ] Disable JavaScript entirely, then click both links → both still download → AC-1
- [ ] Check the downloaded filename → `fintrack-transactions-YYYY-MM-DD.csv`, with today's date in your own timezone, not the server's → AC-15
- [ ] Change the profile timezone to one a day ahead near midnight, then export → the filename uses your day, not the server's → AC-15
- [ ] Export twice on different days → neither file overwrites the other → AC-15

## What is in the file

- [ ] Open `transactions.csv` in a spreadsheet → it opens by double click, with no import dialogue and no manual delimiter choice → AC-10
- [ ] Read the header row → `date`, `category`, `amount`, `currency`, `note`, `merchant`, `direction`, `id`, `category_id`, `created_at`, in that order → AC-4
- [ ] Search both files for `user_id` → it is in neither, as a column or a value → AC-4, AC-16
- [ ] Count the rows against what `/history` reports for no filters → they agree → AC-2
- [ ] File a spend under a hidden category, then export → it is in the file → AC-2
- [ ] Read the `amount` column → `12.50` on a two decimal currency, with no symbol and no thousands separator → AC-6
- [ ] Log an entry with no note and no merchant, then export → both fields are empty, not the word `null`, and neither is quoted → AC-4
- [ ] Sum the `amount` column in the spreadsheet → it equals the total the app shows for the same set → AC-6
- [ ] Switch the profile to yen and export → an amount reads `1250`, not `12.50`, and the `currency` column says `JPY` → AC-6 (auto target: `export-csv.test.ts`)
- [ ] Read the `date` column → the same `YYYY-MM-DD` the app shows, unchanged → AC-7
- [ ] Read the `created_at` column → an ISO 8601 instant in UTC, not the profile timezone → AC-7
- [ ] Check its exact shape → `YYYY-MM-DDTHH:mm:ss.sssZ`, milliseconds and trailing `Z` included → AC-7
- [ ] Open `categories.csv` → header row `name`, `kind`, `color`, `hidden`, `id`, `created_at`, in that order → AC-5
- [ ] Take a `category_id` from the transactions file and find it in the categories file → it is there → AC-5
- [ ] Hide a category, then export → it is in the file with `hidden` reading `true` → AC-3
- [ ] Make a category and never spend under it, then export → it is still in the file → AC-3
- [ ] Confirm both category kinds appear, not just spend → AC-3
- [ ] Read the `color` column → the stored token, for example `green`, unchanged → AC-5

## Escaping, and the characters that break a CSV

- [ ] Log a note containing a comma, then export → the field is wrapped in quotes and the spreadsheet shows one cell, not two → AC-8 (auto target: `export-csv.test.ts`)
- [ ] Log a note containing a double quote, then export → the inner quote is written twice and the spreadsheet shows the original single quote → AC-8
- [ ] Log a note containing both a comma and a double quote → both rules apply together and the cell survives → AC-8
- [ ] Log a note containing a line break, then export → the field is quoted and the spreadsheet keeps it as one cell on one row → AC-8
- [ ] Log a note with no special characters → it is not quoted, so quoting is by content and not blanket → AC-8
- [ ] Read the escaping function → the inner quotes are doubled before the wrapping quotes are added, never after → AC-8
- [ ] Log a note reading `=1+1`, then export and open in a spreadsheet → note what happens. The file must contain `=1+1` exactly; what the spreadsheet then does with it is the accepted tradeoff → AC-9
- [ ] Log a note with an accented character, then open the file in Excel → the character is correct, not mojibake → AC-10
- [ ] Inspect the first bytes of the file → the UTF-8 byte order mark is there → AC-10
- [ ] Inspect the line endings → carriage return plus line feed, including after the last record → AC-10

## Proving it is whole

- [ ] Log more rows than one page holds, then export → every row is in the file, none twice → AC-11
- [ ] Read the loader → the completeness check compares rows received against the count the database reported, never against the length of the array it just built → AC-11
- [ ] Break the read deliberately on a scratch branch so fewer rows come back than the count reports → an error response, and no file downloads at all → AC-12 (auto target: `export-completeness.test.ts`)
- [ ] On that same broken branch → confirm nothing partial reached the downloads folder, and no 200 was answered → AC-12
- [ ] Read the error response → `text/plain; charset=utf-8`, one readable sentence, not a JSON object → AC-12
- [ ] Read the constant → `MAX_EXPORT_ROWS` is 100,000, with its reasoning beside it → AC-13
- [ ] Set `MAX_EXPORT_ROWS` low on a scratch branch, then export an account above it → a 413 whose plain text body names the count and the limit, readable in the browser, and no truncated file → AC-13
- [ ] Confirm the refusal happens before any paging begins, not after building most of the file → AC-13
- [ ] Read the paging → it orders by `occurred_on DESC, created_at DESC, id DESC`, and asks for rows after the last tuple it saw rather than at an offset → AC-11
- [ ] Search the export loader for an offset or a range by position → there is none → AC-11
- [ ] Confirm the page size is 1,000 rows → AC-11
- [ ] Insert a transaction from a second session while an export is paging, then check the file → no row appears twice and none is missing → AC-11 (auto target: `export-completeness.test.ts`)
- [ ] Edit an existing entry's date mid export → the same, and note that the row count alone could not have caught this → AC-11
- [ ] Make the read come back with no count at all on a scratch branch → it throws rather than sending what arrived → AC-11, AC-12

## The empty case, and the edges

- [ ] Export from an account with nothing logged → a valid CSV containing only the header row → AC-14
- [ ] Open that file in a spreadsheet → it opens, showing the column names → AC-14
- [ ] Export from an account with categories but no transactions → the categories file has rows, the transactions file has only its header → AC-14, AC-3

## Security

- [ ] Sign out and request `/api/export/transactions` directly → `proxy.ts` refuses it before the handler runs → AC-16
- [ ] Do the same for `/api/export/categories` → the same refusal → AC-16
- [ ] Search the feature's source for `user_id` → it appears nowhere → AC-16
- [ ] Search the feature's source for an insert, update, or delete → there are none → AC-20
- [ ] Confirm no migration was added for this feature → AC-20
- [ ] Confirm nothing records that an export happened → AC-20

## The pure half

- [ ] Read `lib/export.ts` → escaping a field, building a row, and assembling a document take values and return a string, with no backend, no request, and no clock → AC-19
- [ ] Run the unit tests with no backend credentials present → the escaping, the byte order mark, and the line endings are all still proved → AC-19 (auto target: `export-csv.test.ts`)

## Accessibility

- [ ] Reach both export links by keyboard alone, in a sensible order → AC-1
- [ ] Confirm the Export section has a heading naming it, so it is distinguishable from the other Settings sections → AC-1
- [ ] Run the axe check against `/settings` with the Export section present, in both themes → no violations → AC-1

## What the build turned up

_Added after `/develop`. These are things the acceptance criteria could not have known to ask for, found while building._

- [ ] Read `keysetFilter()` in `lib/month.ts` → every value is double quoted. A timestamp carries a dot and a plus, and PostgREST's `or=(...)` grammar reads both as its own punctuation, so an unquoted cursor silently matches the wrong rows rather than erroring → AC-11
- [ ] Export an account with more rows than `EXPORT_PAGE_SIZE`, with many of them sharing one day → every row appears exactly once and the newest first order holds across the page seams. Ties on the day are the point: they are what forces the cursor down to `created_at` and then to `id`, and a single row per day would never exercise it → AC-11
- [ ] Read `loadAllCategories()` → it does not page. It asks for up to the ceiling in one read and leans on the count comparison, so an account above PostgREST's own server limit throws rather than truncating. Correct, and worth knowing before somebody reads the missing loop as an oversight → AC-3, AC-12
- [ ] Check both responses for `Cache-Control: no-store` → it is there. No acceptance criterion asked for it, and without it a cached response is the quietest possible way to hand somebody last week's backup as though it were today's → AC-15
- [ ] Break the read on a scratch branch and open the route in a browser → the thrown message is what you read in the tab. These messages are user facing copy now, so check they read as sentences and reveal nothing surprising → AC-12
- [ ] Run the axe check against `/settings` with the Export section present, in both themes → the e2e suite covers `/transactions`, `/categories`, and the gallery, but not this screen, so nothing automated is watching it → AC-1
