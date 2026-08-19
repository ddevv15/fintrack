# 0004b. Money units, currency, and timezone

Child of [0004 sign in and your account](index.md). Covers how an amount is stored and read for any currency, and how your currency and timezone reach server code. The sign in half lives in [0004-auth-and-session.md](0004-auth-and-session.md).

## Summary

An amount is a whole number of **minor units**: the smallest unit the currency actually has. That is one cent for a dollar, one whole yen for a yen, and one thousandth of a dinar for a Kuwaiti dinar. The stored integer never changes meaning; only the number of decimal places used to display it does, and that comes from the currency. Your currency and your timezone become columns on your profile, chosen by you and never guessed, and one small function is the only way server code reads them.

## Inline rationale

The stored integer was always right. What was wrong was the name: `amount_cents` and `formatCents()` assert that a minor unit is one hundredth, which is false for roughly twenty currencies. Renaming while the table is empty costs an afternoon; the same correction after a year of entries is a data migration on the one table whose values cannot be regenerated.

The decimal count comes from a list in the repository rather than from the runtime's `Intl` data, because `Intl` answers from whatever ICU version the runtime ships, and a server and a browser disagreeing about the yen renders an amount a hundred times off. It is not stored on the profile either, because the exponent is a fact about the currency, not about the person. The database holds the same list so it can refuse a bad code, and a test fails if the two ever drift.

Currency locks once history exists. That is blunt, and every alternative was worse: reinterpreting stored numbers silently changes what past months mean, and rescaling them invents an exchange rate nobody supplied.

## Feature design

**Data model sketch**:

`public.currencies` (new, reference data)

| Column | Type | Required | Notes |
|---|---|---|---|
| `code` | `text` PK | yes | `CHECK (code ~ '^[A-Z]{3}$')`. ISO 4217 alphabetic code |
| `decimals` | `smallint` | yes | `CHECK (decimals BETWEEN 0 AND 3)`. The minor unit exponent |
| `name` | `text` | yes | The dropdown label, for example `Japanese yen` |

Seeded with exactly these twenty, so `/develop` does not choose them:

| `USD` 2 | `EUR` 2 | `GBP` 2 | `INR` 2 | `JPY` 0 |
|---|---|---|---|---|
| `CNY` 2 | `AUD` 2 | `CAD` 2 | `CHF` 2 | `SGD` 2 |
| `HKD` 2 | `NZD` 2 | `SEK` 2 | `NOK` 2 | `DKK` 2 |
| `ZAR` 2 | `AED` 2 | `SAR` 2 | `KRW` 0 | `KWD` 3 |

Two zero decimal currencies and one three decimal currency are in the list deliberately, so the exponent path is reachable by a real choice and not only by a test.

`public.profiles` (exists, gains two columns)

| Column | Type | Required | Change | Notes |
|---|---|---|---|---|
| `user_id` | `uuid` PK | yes | unchanged | |
| `display_name` | `text` | no | unchanged | now actually read and written |
| `currency` | `text` | no | **new** | `REFERENCES public.currencies(code)`. Null means not chosen yet, never a default |
| `timezone` | `text` | no | **new** | IANA name. Null means not chosen yet. Validated against `pg_timezone_names` |
| `created_at` | `timestamptz` | yes | unchanged | |

`public.transactions` (exists, one rename)

| Column | Change | Notes |
|---|---|---|
| `amount_cents` → `amount_minor` | renamed | Same `bigint`, same `> 0` check, same values. Only the assertion in the name changes |

**Relationships**: `currencies` 1 to many `profiles` through the foreign key on `profiles.currency`. Transactions gain no currency column, because currency is locked once history exists and therefore cannot differ between two rows of one account.

Two implementation traps worth stating, because both are easy to get wrong:

- **The timezone check cannot be a `CHECK` constraint.** `pg_timezone_names` is a view, and a `CHECK` may not run a subquery. Use a `BEFORE INSERT OR UPDATE` trigger, or a function that is honestly not marked `IMMUTABLE`. A function marked `IMMUTABLE` that reads a catalog view is a lie Postgres will eventually act on.
- **A second trigger is what makes the currency lock honest.** The lock trigger deliberately allows null to a value, and that carve out is only safe if a transaction genuinely cannot exist first. Nothing in row level security enforces that, so a `BEFORE INSERT` trigger on `transactions` must refuse any insert while the account's profile is incomplete. Without it the carve out is an assumption.
- **`currencies` needs its own row level security.** It holds no personal data and every signed in account may read all of it, but a table with no policy in this project is a leak by the rule in `AGENTS.md`. Enable row level security and grant select `TO authenticated`, with no insert, update, or delete policy at all.

**State transitions**:

Profile completeness: `incomplete` (either column null) → `complete` (both set). One way only; neither column can be set back to null.

Currency: `unset` → `chosen` → `locked` (the first transaction is written). The move to `locked` is not a stored state, it is the existence of a transaction row, so nothing has to be kept in sync.

**API surface**:

Server actions and one read helper. There is no HTTP endpoint here; these run in process.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getSettings()` (helper) | read | none, resolves the user from the session | `{ isComplete: true, currency, decimals, timezone, displayName }` or `{ isComplete: false, displayName }` | signed in | throws when the profile is missing or unreadable. An incomplete profile is neither, so it returns the second shape rather than throwing |
| `completeSetup` (action) | POST | `currency:string` (req), `timezone:string` (req) | redirect to home | signed in | code not in the supported list, timezone unknown, profile already complete |
| `updateProfile` (action) | POST | `displayName:string` (opt), `timezone:string` (opt), `currency:string` (opt) | `{ ok: true }` | signed in | currency locked by existing transactions, timezone unknown |
| `listCurrencies()` (helper) | read | none | the twenty supported codes with names and decimals | public | none, it reads `lib/currency.ts` and never queries |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| sign up form | the currency options | `lib/currency.ts`, the typed mirror. Not a query, so the form renders with no database round trip |
| sign up form | the preselected currency | `APP_CURRENCY` from `lib/env.ts`, demoted to a suggestion only |
| sign up form | the preselected timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` in the browser, a suggestion the person may change. `APP_TIMEZONE` is the fallback suggestion when the browser gives nothing |
| account creation | `profiles.currency`, `profiles.timezone` | the signUp profile payload, written by `handle_new_user()` reading `NEW.profile ->> 'currency'` and `NEW.profile ->> 'timezone'` |
| Google account creation | `profiles.currency`, `profiles.timezone` | neither is present in the payload, so both are null and the setup screen supplies them |
| any amount on screen | the decimal count | `lib/currency.ts` keyed by the currency from `getSettings()`, after narrowing on `isComplete`. Never `Intl`, never a hardcoded 100. A caller that has not narrowed cannot reach the currency, which is the point of the union |
| any amount on screen | the currency glyph | `currencySymbol()` in `lib/money.ts`, from `Intl` formatting parts. Safe here because a wrong glyph is cosmetic and a wrong exponent is not |
| any date on screen | the calendar day | `today(now, getSettings().timezone)`. No signed in path passes `APP_TIMEZONE` |
| this month's queries | the month start and end | `currentMonthRange(now, getSettings().timezone)`, half open, as spec 0002 already requires |
| settings screen | whether currency is changeable | a count of the account's transactions, taken at render. The database trigger is the real guard; this only decides what the screen says |
| the drift test | the expected decimals per code | both sides at once, `lib/currency.ts` and a select over `public.currencies`, asserted equal |

**Key invariants**:

- Money is a whole number of minor units in `bigint`. No money value is ever `numeric`, `real`, or `double precision`, and no code outside `lib/money.ts` multiplies or divides an amount.
- The divisor for display is `10 ** decimals` where `decimals` comes from the currency. The literal `100` appears nowhere in money handling.
- `lib/currency.ts` and `public.currencies` agree on every code and every decimal count, enforced by a test that fails the build.
- Null in `currency` or `timezone` means not chosen yet. No code path reads either as a default or substitutes an environment variable for a signed in person.
- Once a transaction exists for an account, that account's currency cannot change. Enforced by a `BEFORE UPDATE` trigger on `profiles`, with the server action checking first only so the screen can explain it in plain words.
- `getSettings()` throws rather than returning partial data. A missing profile produces an error page, never a screen with money on it.
- Setting a currency for the first time, null to a value, is always allowed regardless of the lock trigger. This is safe only because a second `BEFORE INSERT` trigger on `transactions` refuses any insert while the profile is incomplete, so a transaction genuinely cannot exist before a currency is chosen.
- No transaction row exists for an account whose profile is incomplete. Enforced in the database, not in the app, so no future write path can go around it.

**Security model**:

`profiles` keeps its existing select and update policies, both `user_id = (SELECT auth.uid())`. The two new columns need no new policy, because a policy is per row and not per column, so they are covered the moment they exist on a row you own.

`currencies` is reference data with no owner. Row level security is enabled and a single select policy is granted `TO authenticated`. No insert, update, or delete policy exists, so the table is changeable only by a migration, which is the intent.

The one new write path worth naming: `handle_new_user()` now reads two values that originate in a browser form. They are validated in Zod in the server action before signUp is called, and the foreign key and the timezone trigger reject anything that gets past it. A rejected value fails account creation loudly rather than writing a bad profile, which is the correct direction for this project.

**Configuration required**:

No new environment variables. Two existing ones change meaning and the change must be written into `lib/env.ts` as a comment, because their old meaning is documented in spec 0001 and someone will otherwise restore it:

- `APP_CURRENCY`: no longer the app's currency. Now only the currency preselected on the sign up form
- `APP_TIMEZONE`: no longer the app's timezone. Now only the fallback suggestion on the sign up form when the browser offers none. No signed in code path may read it

**Critical test scenarios**:

- Happy path: the stored integer 500 renders as ¥500 on a JPY profile, $5.00 on a USD profile, and the correct three decimal amount on a KWD profile, with no branch outside `lib/money.ts`, verifies **AC-10**.
- Happy path: sign up choosing JPY and `Asia/Tokyo`, and confirm the profile row carries both from a single insert with no follow up write, verifies **AC-1**.
- Failure case: with one transaction on the account, attempt to change the currency directly against the database; the trigger refuses it, verifies **AC-12**.
- Failure case: add a code to `lib/currency.ts` without adding it to the migration; the drift test fails, verifies **AC-11**.
- Failure case: attempt to write a currency code outside the supported list and a timezone that is not an IANA name; the foreign key refuses the first and the trigger refuses the second, verifies **AC-11**.
- Failure case: delete the profile row of a signed in account, then load a page that shows money; a plain error renders and no amount appears anywhere on it, verifies **AC-15**.
- Failure case: a late evening spend logged on the last day of a month lands in the correct month for the profile's timezone and not for the server's, verifies **AC-13**.
- Failure case: with a profile whose currency is still null, attempt to insert a transaction directly against the database; the completeness trigger refuses it, verifies **AC-12**.
- Auth/permission: signed in as account A, read the `currencies` table successfully, then attempt to insert a row into it and be refused, verifies **AC-19**.
