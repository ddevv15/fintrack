# 0006. Log a spend

**Date**: 2026-08-26
**Status**: Accepted

## Summary

The screen you use more than any other: an amount, a category, a date, and an optional note, saved in seconds. The decision at the centre is what your typed amount becomes. It becomes a whole number of minor units (the smallest unit your currency actually has) by string manipulation only, never by multiplying a decimal number, because multiplying is wrong for hundreds of ordinary amounts. If you type more decimal places than your currency has, the form refuses it and says so, rather than quietly rounding a number you did not type. A save that works clears the form and names what it stored, so you can see that what you typed is what was kept. This feature adds no database columns and no migration.

## Requirements

**User stories**:

- As the person using FinTrack, I want to log a spend in a few seconds without leaving the first screen, so that recording money is never the reason I stop tracking it.
- As the person using FinTrack, I want the amount I typed to be the amount that is stored, exactly, so that a month total is the real number.
- As the person using FinTrack, I want a mistake caught before it saves rather than after, so I am not hunting through a month to find it.
- As the person using FinTrack, I want to see what was saved, so I know the entry landed and landed correctly.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: From `/`, a signed in person can enter an amount, choose a spend category, accept or change the date, optionally add a note, and save. The stored row carries `direction = 'spend'`, their own `user_id`, and reading it back returns exactly the values entered.
- **AC-2**: A typed amount becomes minor units by string manipulation only. No code path multiplies or divides a typed amount by a power of ten in floating point. `parseAmount("8.29", 2)` returns exactly `829`, and every amount from `0.01` to `20.00` on a two decimal currency round trips through parse and format unchanged.
- **AC-3**: An amount carrying more decimal places than the currency has is refused, nothing is written, and the message names the actual limit for that currency. `12.567` on a two decimal currency and `500.5` on a zero decimal currency are both refused.
- **AC-4**: The amount field accepts only digits with at most one dot, after trimming surrounding whitespace. A leading minus sign is not part of that set, so a negative amount is refused here rather than later. Each of `1,234.50`, `$12`, `12,50`, `12.5.6`, `12 50`, `-5`, `abc`, `12.`, and an empty value is refused with the message `Enter an amount using digits and at most one dot, like 12.50`, and nothing is written. A leading dot (`.5`) and leading zeros (`007`) are accepted.
- **AC-5**: An amount of zero, and an amount whose minor units would fall outside JavaScript's safe integer range, are each refused before any database call. The safe range check is made on the joined digit string, refusing anything longer than 15 digits, before that string is converted to a number, because converting first loses the very information the check needs.
- **AC-6**: The date field starts at today in the person's own timezone, taken from `today(now, timezone)` with the timezone from `getSettings()`. A date after that day is refused with a message. Any earlier date is accepted.
- **AC-7**: The category control lists only the person's own categories whose `kind` is `spend` and whose `is_hidden` is false, ordered by name. A submitted category id that is not one of those is refused and nothing is written.
- **AC-8**: A successful save clears the form, returns focus to the amount field, and shows a confirmation naming the stored amount formatted through `formatAmount()` and the category name, for example `Saved $12.50 to Groceries`. The confirmation is announced to assistive technology without moving focus to it.
- **AC-9**: A failed save writes nothing, leaves every value the person typed in the form, and attaches the reason to the field that caused it whenever the causing field is known.
- **AC-10**: A database refusal is shown in plain words rather than a code: a category that is not yours or is the wrong kind (`23503`), a check constraint failure (`23514`), and the trigger that blocks a spend while the profile is incomplete. A refusal that matches none of these shows an honest failure message and is never reported as a success.
- **AC-11**: While a save is in flight the submit control is disabled, so a second click during that window cannot produce a second row.
- **AC-12**: When the account has no category with `kind = 'spend'` and `is_hidden = false`, the screen shows `You have no spend categories to log against. Unhide one, or add a new one, then come back.` instead of a form that cannot be completed.
- **AC-13**: No module other than `lib/money.ts` converts between typed text and minor units, and the literal `100` appears nowhere in the conversion. This is checked, not merely asserted: a test scans `lib/` and `components/` and fails on a multiplication or division of an amount outside `lib/money.ts`.
- **AC-14**: `logSpend` narrows the profile itself, with `getSettings()`, before it reads a currency or a timezone, and returns a `FormState` when the profile is incomplete. It must NOT use `requireCompleteSettings()`: that throws, and a throw inside an action escapes to the route error boundary, which replaces the page, loses everything typed, and shows a message written for whoever maintains the code. A server action is its own entry point and the `(app)` layout does not run for it, so the layout's completeness redirect protects the render only. A save attempted with an incomplete profile is refused by the action in plain words, and the database trigger remains as the second line.

## Decision

**Chosen option**: Option 2: a string only parse in `lib/money.ts` that refuses what it cannot represent exactly.

A typed amount is split on its single dot, its fraction padded or refused against the currency's own decimal count, and the digits joined into an integer, so no decimal arithmetic ever touches money; anything the rule cannot represent exactly is returned as a refusal that the server action turns into a field error, and the form stays on screen with your values intact.

**The parse, stated exactly**, so there is one way to build it. Given the typed text and the currency's `decimals`:

1. Trim surrounding whitespace.
2. Refuse unless the whole string matches digits with at most one dot, with at least one digit somewhere: `.5` and `007` pass, `12.` and `-5` and `12 50` do not.
3. Split on the dot into an integer part and a fraction part, either of which may be empty.
4. Refuse when the fraction part is longer than `decimals`. This counts digits typed, not their value, so `500.00` is refused on a currency with no decimal places, and the rule stays one sentence you can put in an error message.
5. Pad the fraction part with trailing zeros up to `decimals`, then join it to the integer part.
6. Refuse when the joined string is longer than 15 digits, before converting it, since converting a longer one silently loses precision rather than failing.
7. Convert with `Number()`, refuse a result of zero, and assert `Number.isSafeInteger` as a final guard that should now be unreachable.

No step multiplies, divides, or rounds.

**Implementation skills**: `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `insforge` (`InsForge`, `~/.agents/skills/insforge/`)

## Rationale

Reasoning, the options weighed, and the evidence behind the parse rule: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No schema change. No migration. Every column and every constraint this feature needs already exists from [spec 0002](../0002-data-model/index.md) as [spec 0004b](../0004-sign-in-and-your-account/0004-money-units-and-locale.md) renamed it.

Written on save, one row in `public.transactions`:

| Column | Required | Value this feature supplies | Constraint already enforcing it |
|---|---|---|---|
| `id` | yes | nothing, the database generates it | `DEFAULT gen_random_uuid()` |
| `user_id` | yes | nothing, the database fills it | `DEFAULT auth.uid()` plus the insert policy |
| `category_id` | yes | the chosen category | composite foreign key below |
| `direction` | yes | the constant `'spend'` | must equal the category's `kind` |
| `amount_minor` | yes | the parsed whole minor units | `CHECK (amount_minor > 0)` |
| `occurred_on` | yes | the date field, starting at today in your zone | no default, so a caller must always supply it |
| `merchant` | no | not set, stays null | `CHECK (char_length(merchant) <= 200)` |
| `note` | no | the note field, or omitted when blank | `CHECK (char_length(note) <= 500)` |
| `created_at`, `updated_at` | yes | nothing | `DEFAULT now()` and `set_updated_at()` |

The composite foreign key `(user_id, category_id, direction)` referencing `categories (user_id, id, kind)` is what makes AC-7 enforceable in the database rather than trusted from the browser. A submitted category id belonging to someone else, or an income category, is refused by Postgres even if every application check were removed.

Read on render, from `public.categories`: `user_id` is yours by row level security, `kind = 'spend'`, `is_hidden = false`, ordered `name.asc`. A new account always has ten, created by the `seed_new_user` trigger, so the empty case of AC-12 is reachable only once feature 9 lets you hide them.

**State transitions**: none. A transaction has no lifecycle in this project; it exists, it is later edited or deleted by feature 7. The only state this feature moves is the form itself: `idle` to `submitting` to either `ok` (cleared, confirmation shown) or `error` (values kept, reason shown). `submitting` is what disables the submit control for AC-11.

**API surface**:

Server actions and one read helper, running in process. No HTTP endpoint is added.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `listSpendCategories()` (helper) | read | none, resolves the user from the session | `{ id, name, color }[]` ordered by name | signed in | throws when the query fails, so the screen errors rather than showing an empty picker that looks like no categories |
| `logSpend` (action) | POST | `amount:string` (req), `categoryId:string` (req), `occurredOn:string` (req), `note:string` (opt) | `FormState`: `{ status: "ok", message }` naming what was saved, or `{ status: "error", message, fieldErrors }` | signed in, own rows only | amount unparsable or out of range, date in the future, category not yours or wrong kind (`23503`), check violation (`23514`), profile incomplete (trigger) |
| `parseAmount(text, decimals)` (pure function in `lib/money.ts`) | n/a | the typed text, the currency's decimal count | `{ ok: true, minor }` or `{ ok: false, reason }` | n/a, pure | returns a reason, never throws for ordinary bad input |

`parseAmount` returns a result rather than throwing because its failures are the normal case of a person typing, not an exceptional condition. The action maps `reason` to a field error on `amount`; a thrown exception would have to be caught to do the same thing, and a caught exception used for control flow is the pattern that eventually swallows a real one.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| render the form | the currency glyph beside the amount field | `currencySymbol(currency)` in `lib/money.ts`, with `currency` from `getSettings()` after narrowing on `isComplete` |
| render the form | the decimal count the parse is checked against | `getSettings().decimals`, which comes from `lib/currency.ts` keyed by your currency. Never `Intl`, never a hardcoded 2 |
| render the form | the date the field starts on | `today(new Date(), getSettings().timezone)`. Not the server clock and not the browser |
| render the form | the maximum date the field allows | the same value as the start date, so the control and the server agree on one definition of today |
| render the form | the category options | `listSpendCategories()`, which is `kind = 'spend'` and `is_hidden = false` ordered by name, scoped by row level security |
| render the form | whether to show the form or the empty state | the length of that same category list, taken at render. No second query |
| `logSpend` | the currency, decimals, and timezone it works from | `getSettings()`, called by the action itself and narrowed on `isComplete`. Not inherited from the layout, which does not run for an action, and never taken from the submitted form |
| `logSpend` | `amount_minor` | `parseAmount(amount, decimals)` where `decimals` comes from that call, never from the browser |
| `logSpend` | `occurred_on` | the submitted `occurredOn`, validated as a plain date and compared against `today(new Date(), timezone)` computed on the server |
| `logSpend` | `direction` | the constant `'spend'`. This feature never writes income; feature 14 owns that |
| `logSpend` | `category_id` | the submitted `categoryId`, checked as a uuid by Zod and then as yours and of the right kind by the composite foreign key |
| `logSpend` | `note` | the submitted note, trimmed. Blank becomes omitted rather than an empty string, so a note is either real text or absent |
| `logSpend` | `user_id` | the database `DEFAULT auth.uid()`. The app never sends it, which is what makes a forged user id impossible rather than merely checked |
| `logSpend` | the confirmation text | `formatAmount(minor, currency)` for the amount and the chosen category's `name`, both taken from what was actually stored, not from what was typed |
| `logSpend` | the message for a database refusal | a fixed map from the Postgres SQLSTATE code to plain words, defined in this spec's failure table below |

**Key invariants**:

- A typed amount reaches minor units through string manipulation only. `Number(text) * 10 ** decimals` is forbidden, including with a rounding call wrapped around it. Verified: 271 of the first 2000 cent values on a two decimal currency produce a non integer from that expression, and `1.005` at three decimals rounds to `1004` where a person expects `1005`.
- `parseAmount` is the only conversion from text to minor units, and it lives in `lib/money.ts`, keeping rule 1 of `AGENTS.md` true.
- The decimal count used by the parse always comes from the currency, on the server, at the moment of the save. A decimal count carried in the form is never trusted.
- The action narrows the profile itself rather than relying on the layout. Every server action is reachable by a POST that renders no layout, so any guard living only in a layout is absent from it.
- The safe range is checked on digits, before any conversion. A check made after conversion is inspecting a value that has already lost precision.
- A refusal writes nothing. There is no partial save, no default amount, and no zero substituted for something unparsable.
- What the confirmation names is what the database stored, formatted from the stored integer, not echoed from the typed text.
- `occurred_on` is never later than today in the person's own timezone, and today is computed on the server.
- The form is server rendered and the action is a server action, so every rule above holds with no JavaScript in the browser.

**Security model**:

Reads and writes are the signed in person's own rows only, enforced by row level security keyed to `auth.uid()`, not by an application filter. The `/` route sits inside `app/(app)/layout.tsx`, which already refuses an unauthenticated request twice over: `proxy.ts` checks the session cookie, then `requireUser()` asks the backend, so a forged token fails at the second gate.

That gate protects the render, and only the render. A server action is its own entry point reached by a POST, so `app/(app)/layout.tsx` does not run for `logSpend` and neither does its completeness redirect. The action therefore repeats the check for itself, with `getSettings()` and a narrowing on `isComplete`, which is the same belt and braces reasoning the layout already applies to the proxy (AC-14).

The one new write path is `logSpend`, guarded five deep: the profile narrowed by `getSettings()`, Zod on the shape of every submitted field, `parseAmount` on the amount specifically, the composite foreign key on the category being yours and of the right kind, and the `amount_minor > 0` check. The `user_id` is never accepted from the browser at all.

No rate limiting is added. This path is behind sign in for one person, and an attacker holding a valid session can only write rows they already own, so a limit would add a failure mode to the most used screen in exchange for a threat this app does not face. Arcjet stays on the unauthenticated auth surface where feature 5 put it.

No new personal data category is introduced; this feature writes the same money rows spec 0002 already governs.

**Configuration required**: none. No new environment variable, no new secret, no new third party account.

**Failure map** (AC-10). Every entry is shown as plain words on the form, and the typed values stay:

| Cause | Shown as |
|---|---|
| `23503`, foreign key: the category is not yours, or its kind is not `spend` | That category is not one of your spend categories. Choose another. |
| `23514`, check: an amount or note the database refuses | That entry has a value this app cannot store. Check the amount and the note. |
| The `BEFORE INSERT` trigger refusing a spend while the profile is incomplete | Choose your currency and timezone before logging a spend. |
| Anything else, including a network failure | Could not save that spend. Nothing was recorded, so try again. |

The last row is deliberately not silent and deliberately not a success. Rule 3 of `AGENTS.md`: return the error and show it.

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):

- Happy path: typing `12.50`, choosing Groceries, leaving the date at today and saving writes one row with `amount_minor = 1250`, then the form clears and reads `Saved $12.50 to Groceries`, verifies **AC-1**, **AC-8**.
- Money exactness: every amount from `0.01` to `20.00` parses to the exact expected integer, and `8.29` gives `829` rather than `828.9999999999999` rounded, verifies **AC-2**.
- Currency awareness: `12.567` is refused on a two decimal currency, `500.5` is refused on a zero decimal currency, and `1.005` is accepted as `1005` on a three decimal currency, verifies **AC-3**.
- Rejected input shapes: `1,234.50`, `$12`, `12,50`, `12.5.6`, `-5`, `12.`, and an empty amount are each refused with nothing written, while `.5` and `007` are accepted, verifies **AC-4**.
- Boundary: a 16 digit amount is refused by the digit length check rather than converted, and an amount of `0` and `0.00` are both refused, verifies **AC-5**.
- Failure case: `logSpend` called directly with an incomplete profile is refused by the action itself, without relying on the layout redirect, verifies **AC-14**.
- Convention: the repository scan finds no conversion of an amount outside `lib/money.ts`, verifies **AC-13**.
- Failure case: a future date is refused, the values typed stay in the form, and no row is written, verifies **AC-6**, **AC-9**.
- Failure case: a submitted category id belonging to a second real account is refused by the database and shown in plain words, verifies **AC-7**, **AC-10**.
- Auth/permission: an unauthenticated request to `/` is redirected to sign in and reaches neither the form nor the action, verifies **AC-1**.
- Empty state: an account with every spend category hidden sees the explanation and no form, verifies **AC-12**.

## Build plan

The project builds by Skateboard, the thinnest usable whole first, then grown. The thinnest usable whole here is a form that genuinely saves a correct amount; honest failure messages and the empty state grow onto it. The parse comes first regardless, because it is the one piece that is wrong in a way you cannot see, and it is testable with no UI at all.

1. Add `parseAmount(text, decimals)` to `lib/money.ts`, returning a result union, splitting on the single dot and joining digits, never multiplying. Update the module comment that currently defers this decision to point at this spec, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-13**
2. Unit test the parse in `tests/unit/`: the exhaustive round trip from `0.01` to `20.00`, the zero and three decimal currencies, every rejected shape listed in AC-4, the accepted `.5` and `007`, and the 16 digit boundary, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**
3. Add the repository scan test that fails on a money conversion outside `lib/money.ts`, satisfies **AC-13**
4. Add `listSpendCategories()` in `lib/categories.ts`, filtered and ordered as the value sourcing table states, satisfies **AC-7**, **AC-12**
5. Add the `logSpend` Zod schema to `lib/schema.ts`: amount as raw text, category id as a uuid, occurred on as a plain date, note trimmed with blank omitted, satisfies **AC-4**, **AC-9**
6. Add `actions/transactions.ts` with `logSpend`, opening with `getSettings()` narrowed on `isComplete` for its own currency, decimals and timezone, then parsing, checking the date against today, inserting, and revalidating `/breakdown` so the month figures reflect the new row, satisfies **AC-1**, **AC-5**, **AC-6**, **AC-9**, **AC-14**
7. Build `components/transactions/LogSpendForm.tsx` on the existing primitives, Field with AmountInput, Select, a native date input, and a note input, wired with `useActionState` and the pending flag on the submit control, satisfies **AC-1**, **AC-11**
8. Replace the placeholder body of `app/(app)/page.tsx` with a heading and the form, or the AC-12 empty state when the category list is empty, satisfies **AC-1**, **AC-12**
9. Add the confirmation: extend the `ok` variant of `FormState` in `lib/forms.ts` with an optional message, render it in a `role="status"` region, clear the form, and return focus to the amount field, satisfies **AC-8**
10. Map the database refusals listed in the failure map, with the unmapped case returning an honest error rather than a success, satisfies **AC-10**
11. Accessibility pass against `docs/design.md` and the project checklist: label every control, tie each error to its field, confirm the confirmation is announced without stealing focus, and record the result in `docs/accessibility-pass.md`, satisfies **AC-8**, **AC-9**

## Consequences

**Positive**:

- The amount stored is provably the amount typed, for every currency the app supports, and a test proves it rather than a comment claiming it.
- The rule that `lib/money.ts` is the only module converting money stays true, now on both sides of the conversion rather than only on display.
- The refusal rule means the app never silently changes a number you entered, which is the same promise the breakdown's percentage shares already make.
- Zero migrations. The schema designed in spec 0002 absorbed this feature exactly as it was meant to, which is real evidence for AC-12 of that spec rather than an assertion.
- The form works with no JavaScript in the browser, because validation and the parse both live on the server.

**Negative / tradeoffs**:

- Refusing an amount is stricter than most money forms, which round quietly. Someone pasting `1,234.50` from a bank statement is stopped and has to retype it. That is a real cost, accepted knowingly, and the message has to be good enough to make it obvious rather than annoying.
- Validation only on the server means the round trip is what tells you a value was wrong. On a slow connection that is slower feedback than a browser check would give.
- Until feature 7 ships, a spend you log incorrectly can only be corrected in the database. The confirmation naming the stored amount is the mitigation, not a fix.
- The parse is string manipulation, which is more code and more tests than a one line multiplication, and it will look like overengineering to anyone who has not seen the floating point evidence. The rationale exists partly so it is not simplified back.

**Neutral**:

- `FormState` in `lib/forms.ts` gains an optional message on its `ok` variant. Spec 0003 defined that type, so the change belongs to that spec's surface, noted in Follow-up.
- The `merchant` column stays unwritten. Nothing breaks, and a later feature can start filling it with no migration.
- `components/transactions/` is a new feature directory, following the existing convention of `components/breakdown/` and `components/auth/`.

## Follow-up

- [ ] `lib/forms.ts` `FormState` gains an optional `message` on the `ok` variant. Spec 0003 owns that type, so its record should note the addition once this ships.
- [ ] The `merchant` column now has a screen that could fill it and deliberately does not. Worth deciding in feature 7 or feature 10 whether it earns a field, or whether the note covers it in practice.
- [ ] Correcting a logged spend has no route until feature 7. If that feature slips, an edit path is worth pulling forward, since a tracker you cannot correct stops being trusted quickly.
- [ ] Once feature 9 can hide categories, the AC-12 empty state becomes genuinely reachable and should be exercised by hand, not only by a test that fakes an empty list.
