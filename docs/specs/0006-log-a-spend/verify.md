# Verify: log a spend · spec 0006 · updated 2026-08-26

_Steps derived from spec 0006 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Much of this is already automated. `tests/unit/money.test.ts` proves the parse
across two thousand amounts, and `tests/e2e/log-spend.signed.spec.ts` drives the
screen signed in, including two axe runs. Those are marked below so a run does
not repeat by hand what a command already proves.

The steps that genuinely need a person are the currency ones. Nothing in the
suite changes a profile's currency, because currency locks the moment an account
has history, so proving the decimal count really comes from the currency and not
from a hardcoded two needs an account with no entries yet.

## Commands

- [ ] `npx vitest run tests/unit/money.test.ts` → 39 passing, including the exhaustive round trip from 0.01 to 20.00 → AC-2, AC-3, AC-4, AC-5
- [ ] `npx vitest run tests/unit/money-boundary.test.ts` → 2 passing, no money conversion found outside `lib/money.ts` → AC-13
- [ ] Add `const x = n / 100;` to any file in `lib/`, re-run the boundary test → it fails and names that file and line, then undo → AC-13
- [ ] `npx playwright test --project=chromium-signed-in log-spend` → 12 passing → AC-1, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-11
- [ ] `npm run build` → compiles with no error → AC-1

## UI / manual

**The happy path**

- [ ] Sign in, land on `/` → the Log tab is selected, the heading reads "Log a spend", and the amount field has focus → AC-1
- [ ] Type `12.50`, choose a category, leave the date, save → the form clears and the confirmation reads `Saved $12.50 to <that category>` → AC-1, AC-8
- [ ] Immediately type a second amount without touching the mouse → focus was already in the amount field → AC-8
- [ ] Add a note on one entry and leave it blank on the next → both save, and the blank one stores no note rather than an empty string → AC-1
- [ ] Open `/breakdown` after saving → the new spend is included in the month total → value sourcing, the `revalidatePath` on `/breakdown`

**The parse, where it is worth doing by hand**

- [ ] Type `8.29` and save → the confirmation reads `$8.29`, not `$8.28` → AC-2
- [ ] Type `12.567` → refused, message names 2 decimal places, nothing saved, every field still filled including the category → AC-3, AC-9
- [ ] Type `1,234.50`, then `$12`, then `-5`, then `12.` → each refused with the digits and one dot message → AC-4
- [ ] Type `.99` then `007` → both accepted, as 99 cents and 7 dollars → AC-4
- [ ] Submit with the amount empty → refused with "Enter an amount." → AC-4

**Currency, which is where a hardcoded two would hide**

- [ ] On a fresh account with no entries, set the currency to `JPY`, reload `/` → the glyph beside the field is `¥`, not `$` → value sourcing, `currencySymbol()`
- [ ] On that yen account, type `500.5` → refused, message says this currency has no decimal places → AC-3
- [ ] On that yen account, type `500.00` → also refused, because the rule counts digits typed rather than their value → AC-3
- [ ] On that yen account, type `500` and save → confirmation reads `¥500` → AC-2, value sourcing, `decimals`
- [ ] On another fresh account set to `KWD`, type `1.005` and save → accepted, confirmation reads the three decimal amount → AC-2, AC-3
- [ ] On that dinar account, type `1.0055` → refused, message says at most 3 decimal places → AC-3

**Date, which is where the server clock would hide**

- [ ] With the profile timezone set to something far from the server, for example `Pacific/Auckland`, open `/` near midnight there → the date field shows that zone's day, not the server's → AC-6, value sourcing, `today()`
- [ ] Try to pick tomorrow in the date control → the control refuses it, since `max` is today in your zone → AC-6
- [ ] Remove the `max` attribute in devtools, set tomorrow, save → the server refuses it with "has not happened yet" and nothing is written → AC-6
- [ ] Set a date last month and save → accepted, and it does not appear in this month's breakdown → AC-6

**Failures and the states around them**

- [ ] Submit with no category chosen → refused, nothing written → AC-7
- [ ] In devtools, change the category select's value to a uuid from another account, then save → refused in plain words, not a Postgres code → AC-7, AC-10
- [ ] Stop the backend or go offline, then save → an honest failure saying nothing was recorded, never a success → AC-10
- [ ] Click Log spend twice quickly → the button disables on the first click, and only one row is written → AC-11
- [ ] Hide every spend category on the account, reload `/` → the explanation replaces the form entirely → AC-12
- [ ] Sign out, POST to the action directly → refused, and no row is written → AC-14

**Accessibility, the part the automated run cannot answer**

- [ ] With a real screen reader, save a spend → the confirmation is spoken → AC-8, and the four owed items in [accessibility-pass.md](../../accessibility-pass.md)
- [ ] With a real screen reader, trigger a field error → the reason is announced and tied to its field → AC-9
- [ ] Tab through the whole form → every control is reachable, each has a visible focus ring, and the order is amount, category, date, note, submit → AC-8

## Acceptance-criteria coverage

- AC-1 covered by the happy path steps and the build command
- AC-2 covered by the unit run, the `8.29` step, and the yen and dinar saves
- AC-3 covered by `12.567`, and by the yen and dinar refusal steps
- AC-4 covered by the rejected shapes step, the `.99` and `007` step, and the empty amount step
- AC-5 covered by the unit run, which holds the 15 and 16 digit boundary
- AC-6 covered by the four date steps, including the one with the `max` attribute removed
- AC-7 covered by the no category step and the forged category id step
- AC-8 covered by the confirmation steps, the refocus step, and the screen reader step
- AC-9 covered by the retention half of the `12.567` step and the screen reader error step
- AC-10 covered by the forged category step and the offline step
- AC-11 covered by the double click step
- AC-12 covered by the hidden categories step
- AC-13 covered by the boundary test, and by deliberately breaking it and watching it fail
- AC-14 covered by the signed out POST step

## Known owed

The screen reader steps are owed, as they are for every earlier feature. See
[accessibility-pass.md](../../accessibility-pass.md) for what the accessibility
tree already confirms and what still needs a person with the audio on.
