# 0007. This month's transactions

**Date**: 2026-08-26
**Status**: In Progress

## Summary

A plain list of every spend you logged this month, newest first, with the month total above it, plus the ability to correct or remove any single entry. Editing happens on its own small screen at `/transactions/[id]/edit`; deleting happens on the row itself, behind a confirm step that names what is about to go. Nothing new is added to the database: spec 0002 already built the index this list needs and the update and delete access rules it needs, so this feature is entirely application code. The one thing to hold onto through the build is that this screen and the Breakdown screen must read the same month in the same way, or they will quietly report two different totals for the same month.

## Requirements

**User stories**:

- As the person using FinTrack, I want to see everything I logged this month in one plain list so that I can check what is there and spot anything wrong.
- As the person using FinTrack, I want to correct an entry I typed wrong so that a mistake does not sit in my totals forever.
- As the person using FinTrack, I want to delete an entry I logged twice or logged by accident so that my month is actually what I spent.
- As the person using FinTrack, I want an empty month to tell me it is empty so that I can tell "nothing logged" apart from "the app is broken".

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/transactions` lists every spend logged in the current month as a flat list, newest first, with two entries on the same day ordered most recently created first. The ordering is done by the database, not in TypeScript.
- **AC-2**: The month is the signed in person's own month, taken from their timezone through `getSettings()` and `currentMonthRange()`. It is never the server clock and never the browser, and it is the identical window `loadMonthBreakdown()` uses.
- **AC-3**: A month to date total is shown above the list, summed from exactly the rows the screen rendered, in a single pass over them. It is never a second query.
- **AC-4**: Each row shows the date, the category name with its colour chip, the amount, and, when there is one, the note as a subtitle truncated to a single line by CSS so the full text stays in the DOM for a screen reader. The amount never wraps, shrinks, or truncates.
- **AC-5**: Only entries with `direction = 'spend'` appear, filtered in the query rather than after the fact, so an income row never reaches the total. Hidden categories are not filtered out: money you spent still counts whatever you later did with the label.
- **AC-6**: A month with nothing logged renders an empty state naming the month, with a link to the Log screen, and shows no total at all rather than a zero.
- **AC-7**: A read that cannot be proved complete throws rather than rendering. The rows received are compared against the exact count Postgres reports for the same filter, and a mismatch, or a missing count, refuses to show a total that might be short.
- **AC-8**: Every row offers an Edit action and a Delete action, both reachable by keyboard. Each control keeps short visible text, `Edit` and `Delete`, while its accessible name identifies the entry, for example "Edit 12.50 Groceries, Aug 19". On a list of visually alike rows, short visible text alone is ambiguous to anyone who cannot see which row it sits in.
- **AC-9**: Edit opens `/transactions/[id]/edit`, a server rendered form built on the existing primitives, with the amount, category, date, and note prefilled from the stored row.
- **AC-10**: The edited amount is turned into minor units by `parseAmount()` using the decimal count of the profile's currency, read on the server at the moment of the save. Nothing multiplies, divides, or rounds an amount anywhere in this feature.
- **AC-11**: The edit refuses a date in the future, judged against today in the person's own timezone, with the same message the Log screen uses.
- **AC-12**: The edit category picker offers the visible spend categories, and additionally the entry's own current category when that category is hidden, preselected. Opening an entry and saving it unchanged can never re file it. A hidden option is labelled as hidden, for example "Coffee (hidden)", and keeps its alphabetical position, so it is never mistaken for a live category.
- **AC-13**: A saved edit returns to the list with a confirmation naming what was actually stored, formatted from the saved row read back from the database, not from the text that was typed. That confirmation appears every time, and exactly once: it is never in the URL, where a bookmark or a shared link would carry a money figure forever, and it never comes back on a reload, a bookmark, or the back and forward buttons. A stale confirmation naming a figure is a wrong figure shown confidently, which rule 3 forbids. How it crosses the navigation is a design choice, recorded below, not part of this criterion.
- **AC-14**: When an edit moves the entry into a different month, it still saves, and the confirmation names the month it moved to, so an entry leaving the list is explained rather than appearing lost.
- **AC-15**: An entry id that does not exist and an entry id belonging to someone else both render the standard not found page, and are indistinguishable from each other.
- **AC-16**: Delete asks for confirmation in the row before anything is removed, and the confirm names the entry's amount and category.
- **AC-17**: When the confirm appears, focus moves to the Confirm control. Cancel or the Escape key dismisses it and returns focus to the Delete control. After a delete succeeds, the row and both its controls no longer exist, so focus moves to the list's status message, which is made programmatically focusable for exactly this. Focus is never left on a control that no longer exists, and never dropped to the top of the document.
- **AC-18**: A confirmed delete removes the row from the database permanently and returns a confirmation naming what was deleted.
- **AC-19**: A write that matches zero rows reports that the entry was already gone, and does not claim to have changed or deleted anything. This holds for both actions: a delete and an edit race the same way, because either can arrive after the entry was removed in another tab.
- **AC-20**: This feature never names a `user_id` and never writes a `direction` other than `spend`. Ownership is decided by row level security and the `auth.uid()` column default, and the composite foreign key is what refuses a category belonging to another account or of the wrong kind.
- **AC-21**: After any write, both `/transactions` and `/breakdown` show it. This includes `logSpend()`, which currently revalidates only `/breakdown` and must now revalidate both.
- **AC-22**: Both write actions check profile completeness themselves rather than trusting the layout, because a server action is its own entry point that no layout runs for, and a failed check returns a message rather than throwing away what was typed.
- **AC-23**: Both routes are reachable and operable by keyboard alone and read correctly to a screen reader, and both pass the `axe` check at WCAG 2.2 AA.
- **AC-24**: The list carries one `role="status"` live region above it, and every outcome this screen produces is announced through it: the edit confirmation arriving with the navigation, a successful delete, and an entry that was already gone. This is the same region pattern `LogSpendForm` already uses. Without it, the only report of a delete is a row silently vanishing, which is nothing at all to a screen reader.

## Decision

**Chosen option**: Option 2: a read only list, with corrections split between a dedicated edit route and an in row delete confirm.

Build `/transactions` as a Server Component reading the whole month in one query, put editing on its own server rendered route, and put deleting on the row behind a two step confirm, deleting the row for real.

**Implementation skills**: `insforge` (`InsForge`, `~/.agents/skills/insforge/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`)

## Rationale

Reasoning, the options weighed, and the premise note: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No schema change. No new table, no new column, no new policy, no migration. Both entities exist from [spec 0002](../0002-data-model/index.md).

| Entity | Key | What this feature does with it |
|---|---|---|
| `transactions` | `id` PK · `user_id` FK to `auth.users` · `(user_id, category_id, direction)` FK to `categories (user_id, id, kind)` | Reads the current month, updates four columns, deletes a row |
| `categories` | `id` PK · unique `(user_id, id, kind)` | Read only: the row chip and the edit picker |

One category has many transactions, and the relationship is held across a three column composite key rather than a plain `category_id` reference. That is what makes the edit safe without an ownership check in TypeScript: re pointing an entry at another account's category, or at an income category, is refused by Postgres.

| Columns | Which |
|---|---|
| Read per row | `id`, `amount_minor`, `occurred_on`, `note`, `categories(id, name, color)` |
| Written on edit | `amount_minor`, `category_id`, `occurred_on`, `note`, plus `updated_at` by the existing trigger |
| Never touched | `user_id`, `direction`, `merchant`, `created_at`, `id` |

Two new Zod schemas are needed on the TypeScript side, because `monthSpendRowSchema` deliberately carries only an amount and a category and must stay that way:

- `monthTransactionRowSchema` in `lib/schema.ts`: the fuller list row above, with `categories` again a single embedded object rather than an array, for the same composite key reason spec 0005 proved.
- `editSpendSchema` beside the action in `actions/transactions.ts`, matching where `logSpendSchema` already lives: that file describes a browser payload, `lib/schema.ts` describes database rows. The amount stays raw text in it, for the same reason it does in `logSpendSchema`.

**State transitions**:

None, deliberately. An entry exists, may be amended, or is removed. There is no draft, no pending, and no archived state, so there is no state machine to hold and no lifecycle column to keep in step. Introducing one is what a soft delete would have done, and rationale.md explains why that was refused.

**How the confirmation crosses the navigation**:

The sentence is handed from the edit form to the list inside the browser, in
`components/transactions/confirmation.ts`: the form leaves it there, then
navigates, and the list takes it once as it mounts. Taking is destructive, which
is what makes it single use, and the list also empties its own region on
`popstate`, so a step through history cannot redisplay one still on screen.

Two more obvious mechanisms are ruled out, and the second one was tried and
measured before it was ruled out, so it is worth being explicit:

- **A query parameter** puts a money figure in the URL, where a bookmark or a
  shared link carries it forever and a reload replays it. Refused outright.
- **A cookie the action sets and the server clears** cannot work in this
  framework. A server action's `redirect()` renders its target inside the same
  POST, before the action has returned, so the list never sees the cookie at
  all; and navigating from the form instead produces two requests for
  `/transactions`, one from `revalidatePath` and one from the navigation, either
  of which consumes the cookie while only one of them is the response actually
  displayed. Measured at five confirmations in ten. See rationale.md.

The general shape of the rule: a message that only the browser needs should
never travel through the server, because every request then becomes a possible
consumer and there is more than one.

**API surface**:

There are no HTTP endpoints. The surface is two routes and two server actions, which is what the App Router gives and what keeps money on the server.

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/transactions` | Route, Server Component | none | `month`, `totalMinor`, ordered rows | Session, then row level security | Throws on a failed or unprovable read, caught by `app/error.tsx` |
| `/transactions/[id]/edit` | Route, Server Component | `id: uuid` (path) | The prefilled form, plus the category options | Session, then row level security | `notFound()` for an unknown id and for another account's id, identically |
| `updateTransaction` | Server action | `id: uuid` (req), `amount: string` (req), `categoryId: uuid` (req), `occurredOn: string` (req), `note: string` (opt) | On failure, `FormState` rendered in place. On success, `FormState` `ok` carrying the confirmation, which the form hands to the list before navigating there | Session, row level security, plus its own profile completeness check | Field errors from the parse; a future date; `23503` category not yours or wrong kind; `23514` a value the column refuses; zero rows matched, reported as already gone |
| `deleteTransaction` | Server action | `id: uuid` (req) | `FormState`, `ok` with a message naming what went. No navigation: it is already on the list | Session, row level security, plus its own profile completeness check | Zero rows matched, which reports "already gone" rather than success; `23503` never applies here |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| List | The month window `start` and `endExclusive` | `currentMonthRange(new Date(), settings.timezone)`, the timezone from `profiles.timezone` through `getSettings()` |
| List | The month heading, for example "August 2026" | `formatMonth(start)` in `lib/time.ts` |
| List | The month to date total | Summed in one pass over exactly the rows rendered, in `lib/transactions.ts` |
| List | Each amount as readable money | `formatAmount(amount_minor, settings.currency)`, the currency from `profiles.currency` |
| List | Each row date | `formatPlainDate(occurred_on)`, formatted in UTC as that function requires |
| List | Each category name and colour | The `categories` embed on the row, not a second query |
| List | Proof the read is complete | The `count: "exact"` value PostgREST reports for the same filter, compared against the rows received |
| List | Row ordering | The database, through `transactions_owner_occurred_idx (user_id, occurred_on DESC, created_at DESC)` |
| Edit form | The prefilled amount as text | `amount_minor` from the row, rendered through `formatAmount()` logic for the major unit value, never by dividing in the component |
| Edit form | The currency symbol beside the amount field | `currencySymbol(settings.currency)`, as the Log screen already does |
| Edit form | The category options | `listSpendCategories()`, unioned with this entry's own category when that category is hidden |
| Edit form | The maximum selectable date | `today(new Date(), settings.timezone)` |
| `updateTransaction` | The decimal count used to parse the amount | `decimalsFor(settings.currency)` through `getSettings()`, read on the server, never carried in the form |
| `updateTransaction` | Today, for the future date refusal | `today(new Date(), settings.timezone)`, computed in the action, never accepted from the browser |
| `updateTransaction` | The confirmation's amount and category | The row read back with `.select("amount_minor,occurred_on,categories(id,name,color)")` after the update, not the submitted text |
| `updateTransaction` | The month named when an entry moves | `formatMonth(saved.occurred_on)`, compared against the current month window |
| `deleteTransaction` | The confirmation's amount and category | The row read back with `.select(...)` on the delete, so the message names what actually went |
| `deleteTransaction` | Whether anything was deleted | The number of rows the delete returned, which is zero when the entry was already gone |
| `updateTransaction` | Whether anything was updated | The number of rows the update returned, zero when the entry was removed between opening the form and saving |
| Edit form | How the confirmation reaches the list across the navigation | Handed over inside the browser by `components/transactions/confirmation.ts`: the form leaves the sentence there and the list takes it, once, as it mounts. Never a query parameter and never a cookie, so money never enters the URL and no server request can consume it |
| List | The announcement of any outcome | The one `role="status"` region above the list, fed by the handoff on mount and by the delete action's `FormState` thereafter, and emptied on any history navigation |
| List | Where focus goes after a successful delete | The status message, made programmatically focusable, since the row that held focus no longer exists |
| Row actions | The accessible name of Edit and Delete | Composed from the same row values already on screen: the formatted amount, the category name, and the formatted date |
| Edit form | The hidden marker on a category option | `is_hidden` on the row already fetched for the union, rendered as a " (hidden)" suffix on the label |
| Both actions | The owner of every row touched | `auth.uid()` inside row level security. Never named, computed, or passed by application code |

**Key invariants**:

- The rows on screen and the total above them come from one read. A total from a second query is the exact gap the completeness guard exists to close.
- `/transactions` and `/breakdown` use an identical month window and an identical spend filter, and they get it from one shared definition both import rather than by writing the same thing twice. This is a build requirement, not a cleanup: two independently written copies drifting apart produces two different totals for one month with no error anywhere.
- A confirmation naming a money figure is shown exactly once, and never survives a reload, a bookmark, or a step through the browser's history.
- No arithmetic on an amount happens outside `lib/money.ts`, in this feature or its components.
- An amount shown back to you after a write is always read from the stored row, never echoed from the input.
- `direction` stays `spend` and `user_id` is never named by application code.
- A read that cannot be proved complete throws. A partial total is never rendered.
- A destructive action is never one tap away from an edit action.

**Security model**:

Single account, no roles, no sharing. Every row this feature touches is scoped by row level security keyed to `auth.uid()`, using policies that already exist on `transactions` for select, update, and delete. Application code never filters by owner and never supplies a `user_id`.

Three specific protections matter here:

- The composite foreign key `(user_id, category_id, direction)` is what stops an edit re pointing an entry at another account's category. A two column key would confirm the category exists with that kind but not that it is yours, and a failed insert would then reveal whether a stranger's id exists.
- An unknown id and another account's id must produce the same `notFound()`. Row level security already makes them indistinguishable to the query; the handling must not reintroduce the difference by wording two errors differently.
- Both server actions re check profile completeness themselves. A server action is reached by a POST with no layout above it, so the redirect in `app/(app)/layout.tsx` does not protect them. They use `getSettings()` and narrow rather than `requireCompleteSettings()`, which throws, because a throw inside an action lands on the route error boundary and destroys what you typed. Feature 6 found this the hard way during verification.

No new personal data is stored and no compliance scope is triggered: this is one person's own data, already held, now editable by that same person.

**Critical test scenarios**:

- Happy path: a month with several spends across several days renders newest first with the same day tiebreak, and the total above equals the sum of the amounts shown, verifies **AC-1**, **AC-3**, **AC-4**.
- Money correctness: editing an amount on a zero decimal currency, a two decimal currency, and a three decimal currency stores the exact minor units and refuses more decimal places than the currency has, verifies **AC-10**.
- Cross screen agreement: the same month read by `/transactions` and by `/breakdown` produces the same total, verifies **AC-2**, **AC-3**.
- Failure case: a read whose reported count exceeds the rows returned throws and renders the error boundary, and never renders a short total, verifies **AC-7**.
- Failure case: deleting an entry that was already deleted reports that it was already gone rather than reporting a successful delete, verifies **AC-19**.
- Edge case: editing an entry's date into last month saves it and names the month it moved to, verifies **AC-14**.
- Edge case: an entry whose category is hidden opens with that category preselected, and saving with no changes leaves the category untouched, verifies **AC-12**.
- Auth and permission: signed out, both routes redirect to sign in; signed in, another account's transaction id renders the standard not found page, identical to a wholly unknown id, verifies **AC-15**, **AC-20**.
- Accessibility: both routes pass `axe` at WCAG 2.2 AA, and the delete confirm moves focus to Confirm then returns it to Delete on cancel, verifies **AC-17**, **AC-23**.

## Build plan

Ordered by the project's Skateboard approach: the thinnest usable whole first, then grown, shippable at every step. Slice 1 alone is a real improvement, since seeing the month is the thing you cannot do today at all. Slice 2 makes it correctable, slice 3 makes it prunable. No migration appears anywhere, because the schema already holds.

1. [x] **The shared month window, then the read and its proof.** First extract the month window and the spend filter into one definition that both `lib/breakdown.ts` and the new loader import, so the two screens cannot drift apart. Do this before writing the second loader, not after: writing the copy first and extracting later is how the copy survives. Then `monthTransactionRowSchema` in `lib/schema.ts`, and `lib/transactions.ts` holding `loadMonthTransactions()`: that shared window, the row cap, the exact count completeness guard, and the total summed in one pass over the rows it returns. Pure summing split from the query so it is testable without a backend, as `summariseMonth()` is. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-7**.
2. [x] **The screen, and the one place it speaks from.** `app/(app)/transactions/page.tsx` as a Server Component, `components/transactions/TransactionRow.tsx` on the existing `ListRow`, `Amount`, `DateDisplay`, and `CategoryChip` primitives, the total above the list, and the `prefetch: false` flag dropped from the transactions tab in `AppShell`. Add the single `role="status"` live region above the list now, focusable, since both later slices feed it. Add `revalidatePath("/transactions")` to `logSpend()` so a new entry appears here. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-21**, **AC-24**.
3. [x] **The empty month.** The `EmptyState` naming the month with a link to the Log screen, and no total rendered at all. Satisfies **AC-6**.
4. [x] **Editing, and the handoff that carries its confirmation.** The `/transactions/[id]/edit` route reading one entry, `notFound()` for an unknown or foreign id, the form on the existing primitives with the category union for a hidden current category and its " (hidden)" marker, and the `updateTransaction` action: its own completeness check, the Zod shape, `parseAmount()` with the profile's decimals, the future date refusal, the database refusal messages, the zero rows case, and the row read back. Then the handoff that carries the confirmation: the action returns it, the form leaves it in `components/transactions/confirmation.ts` and navigates, and the list takes it once on mount and feeds it to the live region built in task 2, emptying that region on any history navigation. Nothing here puts a money figure in a URL, and nothing sends it through the server. Satisfies **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-19**, **AC-20**, **AC-22**.
5. [x] **Deleting.** The `deleteTransaction` action, including the zero rows case reported honestly, and the in row confirm component: a client component in `components/transactions/`, alongside `LogSpendForm.tsx`, with focus moving to Confirm and returning to Delete on cancel or Escape. The delete action needs the currency too, since its confirmation names an amount, so it carries the same completeness check. Both row controls get their entry naming accessible names here, and focus moves to the status message once a delete succeeds and the row it was standing on is gone. Both actions revalidate `/transactions` and `/breakdown`. Satisfies **AC-8**, **AC-16**, **AC-17**, **AC-18**, **AC-19**, **AC-21**, **AC-22**, **AC-24**.
6. [x] **Prove it.** Unit tests for the ordering, the same day tiebreak, and the total summing; a test that both loaders agree on a month, which is cheap now that they share one window; a check that neither a reload nor a step back and forward through history repeats the confirmation; the `axe` check extended to both new routes; and route protection checked for the signed out case. Satisfies **AC-7**, **AC-13**, **AC-15**, **AC-23**, and the money scenarios above.

## Consequences

**Positive**:

- The app becomes trustworthy to use daily. Until this ships there is no way to see or correct a logged spend from inside the app at all, which spec 0006 flagged as the thing that makes a tracker stop being trusted.
- No migration, no new policy, and no new shared UI. The whole feature is application code on foundations already built and verified.
- The completeness guard pattern from feature 8 is reused rather than reinvented, so both money screens refuse to lie in the same way.
- Deleting for real keeps every existing query correct as written, including `loadMonthBreakdown()`, which needs no change whatsoever.

**Negative / tradeoffs**:

- There are now two loaders reading the same month, which is more moving parts than one. The drift risk that comes with that is contained rather than accepted: they share a single month window and filter definition, extracted in build task 1, so the two can only disagree if someone deliberately stops using it. What remains is that a reader has to know two loaders exist.
- There is no record of an edit. Changing an amount or a category silently changes what past Breakdown figures say, and only `updated_at` hints that anything happened. See the premise note in rationale.md.
- Editing costs a navigation each way rather than happening in place. On a phone, correcting three entries is six navigations.
- The delete confirm is a client component. This is ordinary for `components/transactions/`, which already holds `LogSpendForm.tsx`, so spec 0003's high bar is not being spent: that bar applies to `components/ui/`, where `AppNav` remains the only such file and this feature adds nothing.
- Loading the whole month means one very heavy month is one very heavy page. The row cap bounds it, and the guard refuses rather than truncating, so the failure is honest, but a person in that position gets an error instead of a list until pagination is designed.

**Neutral**:

- No new environment variables, secrets, or third party credentials.
- The `merchant` column stays unwritten. This spec decides it does not earn a field here, which closes an open question spec 0006 left to this feature.
- The delete is idempotent by nature and the edit is idempotent by payload, so no idempotency key is needed for either.
- Income remains invisible on this screen. Feature 14 will have to decide whether it joins this list or gets its own.

## Follow-up

- [ ] The shared month window is extracted during this build, but the two loaders remain separate. Feature 16, trends across months, is where spec 0005 expected a shared aggregate to earn its cost. Revisit the merge there rather than now.
- [ ] The confirmation handoff introduced here is the project's first, and it deliberately sits beside this one feature. A second screen wanting the same thing should import it where it is; only a third belongs in `lib/` as a named helper.
- [ ] Editing money leaves no history. Decide, before Release 3 adds budgets, whether an amendment record is wanted. Budgets make a silently edited past month more consequential, because a cap you met can become a cap you missed with no trace.
- [ ] This closes spec 0006's follow up that correcting a logged spend has no route. Mark it done there when this ships.
- [ ] Spec 0006 asked whether `merchant` earns a field in feature 7 or feature 10. This spec answers no for feature 7. Feature 10, search and filter, should settle it for good, since searching for a merchant is the case that would actually justify the column.
- [ ] Confirm the real backend row limit during the build and keep the cap in `lib/transactions.ts` below it, matching the same open item in spec 0005. The exact count comparison catches a short read whatever the limit is, but a cap above the server's own is misleading to leave in the code.
- [ ] The delete confirm is a candidate shared primitive. If a second destructive confirm appears, in feature 9's category hiding or elsewhere, revisit whether it belongs in `components/ui/` with its own gallery entry and `axe` coverage.
