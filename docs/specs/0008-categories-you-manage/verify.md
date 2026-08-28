# Verify: Categories you manage · spec 0008 · written 2026-08-28

_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Nothing here is ticked yet: the feature is not built. Steps that a test should own once it exists are marked **(auto target)** with the suggested test name.

## The list

- [x] Sign in and open `/categories` → every spend category is listed, name ascending, each with its colour swatch and name → AC-1 (auto target: `categories.signed.spec.ts`)
- [x] Look for `Salary` → the seeded income category is not listed anywhere → AC-1
- [x] Read a row → it shows how many transactions use that category → AC-3
- [x] Find a category you have never logged against → its count reads `0`, and the row is present rather than missing → AC-3
- [x] Hide one category, then reload → it appears under a separate Hidden heading below the visible ones, with unhide on the row → AC-2, AC-12
- [x] Hide three categories → the Hidden section lists them name ascending, the same order the visible ones use → AC-2
- [x] Open `/settings` → there is a link to `/categories` and it works → AC-1
- [x] Break the categories read deliberately on a scratch branch → the error page appears, and no partial list and no zero count is shown first → AC-21

## Adding

- [x] Open `/categories/new` → a name field and a colour control, nothing offering to pick spend or income → AC-4, AC-11
- [x] Count the colour options → exactly ten, matching the `categories.color` check constraint → AC-5
- [x] Read each colour option with the swatch ignored → each carries its colour name as text, so colour is never the only signal → AC-5, AC-23
- [x] Open the form on a fresh account with all nine seeded spend categories → the preselected colour is the first in the constraint's order not used by a spend category of yours → AC-5
- [x] Look at a colour one of your categories already uses → it is marked as used, in text as well as visually, and is still selectable → AC-6
- [x] Add a category with a valid name → back on the list with a confirmation naming what was added → AC-4
- [x] Compare that confirmation to what you typed, having typed trailing spaces → it names the row as stored, not the raw input → AC-4
- [x] Add a name matching an existing visible category, in different case → refused, message on the name field → AC-7
- [x] Hide a category, then add a new one with that hidden category's name in different case → refused, and the message says the clash is with a hidden category → AC-7
- [ ] Delete the clashing category from a second tab in the moment between the failed save and the message → the plain name taken message appears, and nothing throws → AC-7
- [x] Submit an empty name → refused, message on the name field, nothing written → AC-8
- [x] Submit a 61 character name → refused, message on the name field, nothing written → AC-8
- [x] Reach 40 spend categories, then add one more → refused with a message naming the limit, and nothing written → AC-9 (auto target: unit test on the cap)

## Editing

- [x] Press edit on a row → `/categories/[id]/edit` opens with the current name and colour prefilled → AC-10
- [x] Look for any control changing spend to income → there is none → AC-11
- [x] Rename to a name another category already holds, in different case → refused on the name field, same as on add → AC-10, AC-7
- [x] Change only the colour and save → the name is unchanged and the new colour is stored → AC-10
- [x] Rename a category to the same name with different capitalisation, for example `groceries` to `Groceries` → it saves, because a row does not clash with itself → AC-10
- [x] Visit `/categories/<a uuid belonging to another account>/edit` → the standard not found page → AC-20
- [x] Visit `/categories/not-a-uuid/edit` → the same page, indistinguishable from the one above → AC-20

## Hiding, and history staying honest

- [x] Hide a category from its row, then open the Log screen → it is gone from the picker, with no manual reload → AC-12, AC-18
- [x] Unhide it → it is back in the picker → AC-12
- [x] Log a spend, hide that category, then open `/breakdown` → the category is still shown with its name and colour, and the month total is unchanged → AC-14
- [x] Compare the month total on `/transactions` and `/breakdown` before and after hiding → all four figures agree → AC-14
- [x] Open an entry filed under the hidden category on `/transactions/[id]/edit` → its own category is still offered and preselected, per spec 0007 → AC-14
- [x] Hide categories until one visible spend category remains, then try to hide it → refused with a message saying why, and nothing written → AC-13
- [x] With exactly two visible spend categories, hide each from a separate tab at the same moment → one succeeds, the other is refused, and you are never left with zero → AC-13 (auto target: integration test driving both writes concurrently)
- [x] Attempt the same hide directly against the database, going around the action → the trigger refuses it → AC-13

## Deleting

- [x] Open the edit screen for a category with entries → there is no delete control, and in its place a line naming the count and pointing at hide → AC-15
- [x] Open the edit screen for a category with no entries → delete is offered → AC-15
- [x] Press delete → a confirm step appears naming the category → AC-16
- [x] Confirm → back on the list, the category is gone, and a confirmation names what was deleted → AC-16
- [x] Open a zero entry category's edit screen in one tab, log a spend against it in another, then delete in the first → a clear refusal, and nothing reported as deleted → AC-17
- [ ] Delete the same category from a second tab that still shows it → already gone, not a reported success → AC-17
- [x] Reduce yourself to one visible spend category with no entries, then try to delete it → refused with a reason → AC-13

## Freshness and the confirmation

- [x] Rename a category, then open the Log picker, `/transactions`, and `/breakdown` in turn → all three show the new name with no manual reload → AC-18
- [x] Change a category's colour, then open `/breakdown` → the new colour is shown → AC-18
- [x] Look at the address bar after any write → no category name or confirmation text in the URL → AC-19
- [x] Reload the list after a write → the confirmation is gone and does not come back → AC-19
- [x] Press back, then forward → the confirmation still does not come back → AC-19

## Security

- [x] Sign in as a second test account and query `category_usage` → only that account's rows come back → AC-22 (auto target: integration test across two accounts, in `tests/integration/`)
- [x] Read the migration and confirm `WITH (security_invoker = true)` is present → AC-22 (necessary but not sufficient; the two account query above is the real check)
- [x] Query `category_usage` as `anon` → refused, because the migration revokes it, matching what `core-schema.sql` does for the three tables → AC-22
- [x] Confirm the running Postgres version supports `security_invoker` on views, which is 15 and above → AC-22
- [x] Sign out and request `/categories`, `/categories/new`, and an edit route → each redirects to sign in → AC-20

## Accessibility

- [x] Tab through the list → every row action is reachable, in a sensible order, with a visible focus ring → AC-23
- [x] Tab through the colour control → it behaves as one radio group, arrow keys move within it → AC-5, AC-23
- [ ] With a screen reader, move through the list → each row's hide and edit actions carry an `aria-label` such as `Hide Groceries`, so which row an action belongs to is never ambiguous → AC-23 _(blocked by a screen reader session; belongs in `docs/owed-checks.md`)_
- [ ] With a screen reader, complete an add → the confirmation is announced once → AC-19, AC-23 _(blocked by a screen reader session)_
- [ ] View the list with colour vision simulation → every category is still distinguishable, because the name and the count carry the meaning → AC-5, AC-23

## What the automated suites now cover

Added by `/develop` once the feature was built. These steps above are locked by
a test, so `/check verify` can read the test rather than repeat the click.

| Covered | By | Steps it locks |
|---|---|---|
| The colour order and the preselected colour | `tests/unit/category-colors.test.ts` | AC-5's "first colour in the constraint's order not already used", including the gap case and the all ten used fallback |
| The view returns a real `0`, not a missing row | `tests/integration/category-management.test.ts` | AC-3 |
| A second account sees none of the first's counts | `tests/integration/category-management.test.ts` | AC-22, the one that cannot be checked by reading the migration |
| Two tabs cannot both hide one of your last two | `tests/integration/category-management.test.ts` | AC-13's concurrency half |
| Hiding moves no total, and keeps the name and colour | `tests/integration/category-management.test.ts` | AC-14 |
| Add, rename, hide, unhide, delete, end to end signed in | `tests/e2e/categories.signed.spec.ts` | AC-1, AC-2, AC-3, AC-4, AC-7, AC-10, AC-12, AC-15, AC-16, AC-18, AC-19 |
| No WCAG 2.2 AA violations on either screen | `tests/e2e/categories.signed.spec.ts` | AC-23's automated half |

Still owed to a person, because no test can answer them: everything under
"Owed: the human listen-through" in
[docs/accessibility-pass.md](../../accessibility-pass.md), and the 40 category
cap (AC-9), which no suite exercises because reaching it means creating forty
rows on a shared account.

## One step the spec did not ask for

- [x] With exactly two visible spend categories, hide both from two tabs at the same moment, repeatedly → one always succeeds and one is always refused with the reason, never both → AC-13

The trigger this spec sketched reads a count and then allows the write, and
inside one trigger that is still two steps. Two tabs hiding two different rows
are two separate `READ COMMITTED` transactions that take no lock in common, so
nothing makes them take turns and both can read "one other is still visible"
before either commits. The window is narrow, which is what makes it dangerous:
a race test passes on most runs against the sketched version.

`migrations/20260828143000_serialise-last-visible-guard.sql` closes it by taking
a lock on the account's own `profiles` row before counting, so this account's
hides and deletes queue behind each other and the count is never read while
another is in flight. Locking the sibling categories instead would deadlock, and
the loser of a deadlock cannot be told why it lost.

The spec's SQL block still shows the earlier version. Worth reconciling in the
spec rather than only here: `/architect categories you manage: the last visible
guard needs a lock to hold under two tabs`.
