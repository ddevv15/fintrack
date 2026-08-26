# Verify: This month's transactions · spec 0007 · updated 2026-08-26

_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Steps marked **(auto)** are already covered by a test in the repository, named beside them. The rest need a person, a real account, and in two cases a change to your own settings.

## UI / manual

### The list

- [ ] Sign in and open `/transactions` → the month's spends are listed, newest first → AC-1 (auto: `transactions.signed.spec.ts`)
- [ ] Log two spends on the same day, then reload the list → the one logged later sits above the other → AC-1 (auto)
- [ ] Read a row → it shows the date, the category name with its colour chip, the amount, and the note when there is one → AC-4 (auto)
- [ ] Give an entry a note longer than the row → it truncates to one line, and the full text is still in the DOM → AC-4
- [ ] Add up the amounts on screen by hand → the sum equals the total shown above them → AC-3 (auto, and unit tested)
- [ ] Open `/transactions` and `/breakdown` in turn → both report the same month total → AC-2, AC-3 (auto)
- [ ] Log a spend on `/` → it appears on `/transactions` without a manual reload → AC-21
- [ ] Delete or move away every entry in the current month → the empty state names the month, links to Log, and shows no total at all, not a zero → AC-6

### The month is yours

- [ ] On the last evening of a month, with your timezone set somewhere already past midnight → the heading names the new month and the list is empty rather than showing the old month → AC-2
- [ ] Change your timezone on the account screen to one a day ahead → the heading and which entries appear follow your zone, never the server's → AC-2
- [ ] Set your currency to JPY, then to KWD → amounts render with no decimals and with three, from the same stored integers → AC-4

### Editing

- [ ] Press Edit on a row → `/transactions/[id]/edit` opens with the amount, category, date, and note prefilled from the stored row → AC-9 (auto)
- [ ] Check the amount field → it holds plain text such as `12.50`, with no currency glyph → AC-9, AC-10 (auto)
- [ ] Save with no changes at all → the amount, the category, and the date are stored exactly as they were → AC-10, AC-12 (auto, unit round trip)
- [ ] Set the date to tomorrow and save → refused, with the same message the Log screen uses, and nothing is written → AC-11
- [ ] Hide the category an entry is filed under (feature 9, or by hand in the database), then edit that entry → its own category is offered, preselected, labelled "(hidden)", in its alphabetical place → AC-12
- [ ] Save that entry unchanged → it is still filed under the same category → AC-12
- [ ] Clear the note and save → the note is removed rather than left as it was → AC-9
- [ ] Type more decimal places than your currency has → refused, and every other field keeps what you typed → AC-10
- [ ] Save a valid edit → back on the list with a confirmation naming the stored amount, category, and date → AC-13 (auto)
- [ ] Look at the address bar → no money figure anywhere in the URL → AC-13 (auto)
- [ ] Reload the list → the confirmation is gone and does not come back → AC-13 (auto)
- [ ] Press the back button, then forward → the confirmation still does not come back → AC-13
- [ ] Edit an entry's date into last month and save → it saves, and the confirmation names the month it moved to → AC-14
- [ ] Visit `/transactions/<a uuid that is not yours>/edit` → the standard not found page, with no money on it → AC-15 (auto)
- [ ] Visit `/transactions/not-a-uuid/edit` → the same page, indistinguishable from the one above → AC-15 (auto)
- [ ] Open the same entry in two tabs, delete it in one, then save in the other → "already gone", and nothing claims to have been changed → AC-19

### Deleting

- [ ] Press Delete on a row → a confirm appears in the row, naming the entry's amount and category → AC-16 (auto)
- [ ] Confirm → the row goes, permanently, and a confirmation names what was deleted → AC-18
- [ ] Check `/breakdown` afterwards → the total has dropped by exactly that amount → AC-21
- [ ] Delete the same entry from a second tab that still shows it → "already gone", not a reported success → AC-19

### Keyboard and screen reader

- [ ] Tab through a row → Edit and Delete are both reachable, in that order → AC-8 (auto)
- [ ] Listen to each control → the accessible name identifies the entry, for example "Edit $12.50 Groceries, Aug 19" → AC-8 (auto)
- [ ] Press Delete → focus lands on Confirm → AC-17 (auto)
- [ ] Press Escape, and separately press Cancel → the confirm closes and focus returns to Delete → AC-17 (auto)
- [ ] Confirm a delete with a screen reader running → the outcome is spoken, and focus lands on the status message rather than the top of the document → AC-17, AC-24
- [ ] Arrive at the list after an edit with a screen reader running → the confirmation is spoken through the same one region → AC-24
- [ ] Delete the last entry in the month → the empty state appears and the confirmation is still announced → AC-6, AC-24

### The read refuses rather than lying

- [ ] Force a short read (lower `MAX_MONTH_ROWS` in `lib/month.ts` below the number of rows in the month) → the error boundary, naming the shortfall, and no total at all → AC-7
- [ ] Confirm the real backend row limit and check the cap in `lib/month.ts` sits below it → AC-7 (spec follow-up)

## Commands

- [ ] `npm run test` → 218 pass, including the ordering, the summing, the month window, and the amount round trip on a zero, two, and three decimal currency → AC-1, AC-3, AC-10, AC-12
- [ ] `npm run test:e2e` → 93 pass, `axe` clean at WCAG 2.2 AA on `/transactions` (light, dark, and mid confirm) and on the edit route → AC-23
- [ ] `npm run typecheck` → clean
- [ ] `npm run lint` → clean
- [ ] `npm run build` → both routes build as dynamic

## Acceptance-criteria coverage

- AC-1 … listed newest first, same day tiebreak · auto (unit + browser)
- AC-2 … the month is yours · auto (unit for the window, browser for cross screen agreement); the timezone change is manual
- AC-3 … total from exactly the rows rendered · auto
- AC-4 … what each row shows · auto, except the long note truncation
- AC-5 … spend only, hidden categories still counted · covered by the shared filter and its drift scan
- AC-6 … the empty month · manual
- AC-7 … a read that cannot be proved complete throws · manual (needs the cap lowered)
- AC-8 … both controls, named by entry · auto
- AC-9 … the edit route, prefilled · auto
- AC-10 … the amount parsed by the profile's decimals · auto (unit round trip); the currency switch is manual
- AC-11 … a future date refused · manual
- AC-12 … the hidden category, preselected and marked · manual
- AC-13 … the single use confirmation · auto (shown once, absent after reload); back and forward is manual
- AC-14 … an entry that moves month · manual
- AC-15 … unknown and foreign ids alike · auto
- AC-16 … the confirm names the entry · auto
- AC-17 … focus to Confirm, back to Delete, then to the status message · partly auto; the post delete move is manual
- AC-18 … the row is really gone · manual
- AC-19 … zero rows reported honestly, on both writes · manual (needs two tabs)
- AC-20 … no `user_id`, no `direction` but spend · by construction; the closed doors are auto
- AC-21 … both screens see every write · manual
- AC-22 … both actions check the profile themselves · by construction, shared helper
- AC-23 … keyboard and `axe` on both routes · auto
- AC-24 … one live region, every outcome through it · partly auto; the listen through is manual

## Known gaps at hand-off

- **The delete flow has no automated browser test.** Everything up to the confirm is covered; confirming would remove a row from the month `breakdown.signed.spec.ts` counts, and the two files run in parallel against one account. Automating it means giving the signed in suite its own account, which is a change to the harness rather than to this feature.
- **The screen reader listen through is owed**, as on every earlier feature. Tracked in [accessibility-pass.md](../../accessibility-pass.md).
