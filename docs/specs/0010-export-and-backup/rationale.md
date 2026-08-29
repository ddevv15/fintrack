# 0010 rationale: Export and backup

The reasoning, the options, and what was weighed. The build spec is [index.md](index.md).

## Context

FinTrack now holds a real ledger. Nine features in, a person can log a spend, file it, correct it, hide a category without losing its history, and search everything they have ever typed. All of it lives in one Postgres database behind one account, reachable only through this app's screens. There is no way to get any of it out.

That is a problem of a particular kind, and it is not really about convenience. A money tracker earns its keep by being the place you put things for years, and the thing that stops a person committing to one is the suspicion that the data is hostage. The suspicion is correct here today: if the hosting lapsed, if the backend account were lost, if the person simply wanted to move to a spreadsheet or to another app, everything typed since the beginning would be gone. Nothing in the app is designed to be lossy, but a system with no exit is lossy by omission.

The forces are narrow, which is unusual and worth saying. There is exactly one reader, the account owner, reading their own rows. There is no sharing, no third party, no regulated scope, and no volume problem: a personal ledger is thousands of rows, not millions. What there is instead is an unusually high correctness bar, set by the app itself. This project has spent three specs establishing that a money figure is either provably right or refused: `assertCompleteMonthRead()` exists because a server side row limit can shorten a result with no error, and spec 0009 extended the same comparison to a screen that shows a total only when it can prove the set is whole. An export is the same problem with the stakes moved. A month screen that quietly drops rows shows a wrong number for a minute. A backup that quietly drops rows sits in a folder for two years looking exactly like a good one, and is discovered to be short on the day it is needed.

There is also a smaller force that shapes more of this decision than it looks like it should: the file has to survive contact with a spreadsheet. CSV is a format everybody believes they understand and almost nobody implements identically, and the gap between a file that is technically valid and a file that opens correctly by double click in Excel is where most export features quietly fail.

## Options considered

### Option 1: One CSV of transactions with the category name written inline

The thinnest possible answer, and a genuinely defensible one under a Skateboard approach. One route, one file, one link. Each row carries its category as a name, so the file reads perfectly well on its own and answers the question a person actually asks, which is what did I spend.

**Pros**:

- The smallest amount of code and the smallest surface to get wrong. One route handler, one loader, one writer.
- One click, one file, nothing to explain about which file is which.
- The file is immediately readable by a human with no cross referencing.

**Cons**:

- A category created and never used does not appear anywhere, and neither does any category's colour or hidden state. That is not a backup of the account, it is a report of the parts of it that were used.
- A category name is not a stable identifier. Renaming a category, which spec 0008 makes a normal thing to do, changes what the historical rows say they were filed under, so two exports taken a month apart disagree about the past.
- Nothing in the file can be read back in later, because there is no way to tell which category row a name refers to. It forecloses an import without saying so.

### Option 2: Two server built CSV downloads, read through a generalised range read, verified whole before a byte is sent

Two GET route handlers, one per entity. Each pages the whole table through the shared read in `lib/month.ts`, compares what arrived against the count Postgres reported, renders a CSV with a pure writer, and hands it over as a named attachment. The transactions file carries both the readable columns and the identifiers, so the pair is a real backup.

**Pros**:

- Complete in the sense the word implies: every row, every category, both directions, hidden included, and the id columns that make the two files a coherent pair.
- The completeness guarantee is the one the app already rests on, not a second idea. The same independent count comparison, applied to a bigger read.
- Reading through the shared function means the file's claim to match what the app shows is structural rather than hopeful, and the invariant test enforces it.
- No new dependency, no migration, no environment variable, and no new service. A plain link means it works with JavaScript off.
- The id columns leave an import possible later without committing to one now.

**Cons**:

- It edits `lib/month.ts` a second time, and four accepted specs depend on that file's behaviour. That is the highest risk change in the plan, for a feature that is otherwise low risk.
- Building the whole file in memory before sending puts a real ceiling on the export, and the number chosen for it is reasoned rather than measured until somebody profiles the hosting plan.
- It forces one assertion in the invariant test to change shape, because threading the direction through as a parameter removes the literal that assertion matches. The guarantee is preserved and the change is written into AC-17, but a changed guard is a thing to review carefully rather than wave through.
- Two files means two clicks, and a person who takes only the first has an incomplete backup while believing otherwise.

### Option 3: One zip holding both files

The same reads and the same writer, packaged into a single archive so there is one click and one artifact to keep.

**Pros**:

- One file to store, one click to get it, and no way to end up with half a backup because you only clicked once.
- Room to grow: a third file, a manifest, a README explaining the columns, all without changing the interaction.

**Cons**:

- It needs a zip library, in a project whose dependency list has been kept deliberately short and whose spec 0001 treated every addition as a decision. The archive formats in Node's standard library compress a stream; they do not build a zip container.
- A zip is opaque. You cannot look at it, diff it, or grep it, and the failure mode of a corrupt archive is worse than the failure mode of a truncated text file because there is no partial reading.
- It buys convenience, not correctness, and it is the only option here that adds a dependency.

### Option 4: Generate the file, store it in InsForge Storage, and hand back a link

The export becomes an artifact rather than a response: build it, upload it to a bucket, return a signed URL. Large exports survive a slow connection, and the file can be downloaded again without regenerating it.

**Pros**:

- Removes the memory and request duration ceiling entirely, since the work is decoupled from the response.
- A person on a bad connection can retry the download without rebuilding the export.
- Naturally extends to an emailed backup or a scheduled one.

**Cons**:

- It puts a complete copy of a person's financial history on a server after the download has finished, which is a new place for that data to live and a new lifecycle to manage: a bucket, its policy, a retention rule, and a deletion story. The feature exists to reduce dependence on the service, and this option deepens it.
- A signed URL is a bearer credential for the whole ledger. It is one more thing that must not leak.
- Substantially more moving parts than the problem has, for a personal ledger of a few thousand rows.

## Rationale

Option 2 wins on the force that dominates this decision, which is the correctness bar the app has already set for itself. Rule 3 of `AGENTS.md` says a wrong money figure shown confidently is worse than an honest error, and every money screen already refuses rather than guesses. An export is where that principle has its longest half life: the file outlives the session, the app, and possibly the service, and nobody re checks it. So the interesting question was never which format, it was where the guarantee lives, and the answer is that it has to live before the first byte goes out.

That answer is what settled the streaming question, which was the closest call in the design. Streaming is the textbook approach for an export, and it is genuinely better on memory and on time to first byte. It is also the option that cannot keep the promise. HTTP commits to a status code before the body, so a stream that fails partway through has already said 200, and the browser has already written a file. What lands is a `.csv` that opens, parses, and looks finished, and is short. That is precisely the failure `assertCompleteMonthRead()` was built to make impossible on a screen, and it would be reintroduced in the one place where nothing would ever notice. Buffering costs a ceiling, and a ceiling can at least be named, measured, and refused out loud. `MAX_EXPORT_ROWS` is that refusal made visible.

Reading through `lib/month.ts` rather than beside it was the other call worth explaining, because the safer looking choice is the wrong one. A separate query in `lib/export.ts` would leave the riskiest file in the app untouched, which is a real argument given that four accepted specs depend on it. But spec 0009 already established what the invariant is actually about: not months, but the rule that two things must never compute the same money figure from two definitions. The scope's own Done when says the file matches what the app shows, which is an agreement claim about money between the export and every screen. A second definition would make that claim true today by coincidence and false later by drift, with nothing to complain. So the read is generalised once more, the wrapper chain stays thin, and the invariant scan grows a fourth entry. The extraction is the risk; the invariant suite, the three money screens, and a deliberately shortened read are the check.

Paging is by keyset rather than by offset, and that is a correctness decision rather than a performance one. An export is several sequential requests, and there is no snapshot holding them together, so a row inserted or edited between two pages shifts every later offset by one. The consequence is a duplicated or a dropped row, and the cruel part is that the count check cannot see it: an edit leaves the total unchanged, so rows received still equals the number reported and the file passes its own test while being wrong. That is the confident wrong figure again, in the one artifact nobody re reads. A cursor made of the last `(occurred_on, created_at, id)` tuple asks for rows after a value rather than after a position, so a concurrent write cannot move the boundary. The `id` is not decoration: without a third key, two rows sharing a day and a creation instant have no defined order between them, and an undefined order is exactly where a cursor loses a row. The first two keys already match `transactions_owner_occurred_idx`, so the cost is a tie break inside groups that are almost always a single row.

One assertion in the invariant test has to change shape, and that deserves saying out loud rather than leaving to the build. The test currently proves that `lib/month.ts` owns the spend definition by matching the literal `.eq("direction", "spend")` anywhere in the file. Making the direction a parameter deletes that literal, so the assertion would fail on a change that does not weaken the guarantee at all. It becomes two checks instead: the file must contain `.eq("direction", direction)`, and it must contain the literal `direction: "spend"` inside `readSpendRange()`. The guarantee is identical, that one file still decides what a spend read is. The distinction worth holding onto is that a guard may change shape when the shape of the thing it guards changes, and may never be loosened to let a refactor through. Writing it into an acceptance criterion is what keeps those two apart, because the second one always arrives disguised as the first.

The format decisions all follow from one observation: a CSV that is technically valid and a CSV that opens correctly are different things, and the difference is where export features fail quietly. So RFC 4180 quoting is written into an acceptance criterion with its order fixed, exactly as spec 0009 fixed the order of the LIKE escaping, because doubling the inner quotes after wrapping rather than before is a plausible wrong order that a casual read passes. The byte order mark is there because without it Excel on Windows reads UTF-8 as its local codepage and turns an accented note into nonsense, which is the single most common way an export looks broken to the person who needs it. And the amount goes out through `formatAmountInput()` because that function already splits the digit string rather than dividing, so the decimal it produces is exact for a two decimal currency and correctly has no decimals at all for yen. Minor units in the file would be exact too, and would also mean that a person who opens their backup and sums the column gets a number a hundred times too big. Between a file a machine reads perfectly and a file a person reads correctly, the currency column lets this one be both.

The formula escaping decision is the one that goes against the usual advice, so it is worth being explicit. The standard mitigation for CSV injection assumes an untrusted writer: somebody puts `=HYPERLINK(...)` into a field that a different person later opens. This app has exactly one writer per account and exactly one reader, and they are the same person. Prefixing would defend against nobody while changing stored values, so the file would stop matching the app, which is the thing the Done when asks for. The condition under which this flips is named in AC-9 and in the follow ups: the day anything other than the account owner can write a note, the decision has to be made again.

## References

**Project sources**:

- `AGENTS.md`, rule 1: money is integer minor units everywhere and `lib/money.ts` is the only module that converts one. It is why the amount column goes out through `formatAmountInput()` rather than through arithmetic in the writer.
- `AGENTS.md`, rule 3: errors are explicit, return them and show them, never fall back to a zero or a partial total. It is the whole of the buffer before sending decision.
- `AGENTS.md`, rule 2: what today is comes from the signed in person's own timezone through `getSettings()`, never the server clock. It is where the filename's date comes from.
- Spec 0002, the data model: the columns both files carry, and `transactions_owner_occurred_idx`, which gives the paging its stable order.
- Spec 0005, `assertCompleteMonthRead()`: the independent count comparison this feature reuses, and the reasoning about why a row cap cannot be the guard.
- Spec 0009, `readSpendRange()`: the first extraction, the invariant scan in `tests/unit/month-window.test.ts`, and the precedent of fixing an escaping order inside an acceptance criterion.
- Spec 0004 child, money units and locale: why an amount is stored and converted the way it is.
- The existing route handlers at `app/auth/callback/route.ts` and `app/api/auth/refresh/route.ts`, which make a GET route handler a pattern the project already has rather than a new one.

**Practices & standards**:

- RFC 4180, the Common Format and MIME Type for Comma Separated Values Files: the quoting rule, the doubling of inner quotes, and CRLF as the record separator.
- The UTF-8 byte order mark as the signal spreadsheet software uses to read a CSV as Unicode rather than a local codepage.
- CSV injection, and the reason the usual mitigation is a control for untrusted input rather than a universal rule.
- Keyset paging over a total order, so a concurrent write cannot shift a page boundary and make a row appear twice or not at all. Offset paging is deliberately refused, because its failure is invisible to a row count comparison.
- ISO 8601 with an explicit UTC offset for a machine timestamp that must round trip.
