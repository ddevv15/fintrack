# 0004. Rationale

The reasoning behind [index.md](index.md) and its two children. `/develop` does not read this file.

## Context

> ⚠️ Premise note: the topic bundled two independent decisions, identity and money units, into one request. They are genuinely coupled, because a per user currency only exists once there is a user, and a user only exists once there is sign in. But they are reasoned separately and will be cited separately later, so this is written as an umbrella with two children rather than one file. Separately, the zero decimal question is not an extension of the current design, it is a correction to it: rule 1 of `AGENTS.md` and the naming in spec 0002 both assert that a minor unit is one hundredth of the currency, and that assertion is simply false for the Japanese yen. Restating the rule is part of this decision, not a side effect of it.

FinTrack has a complete data model, a design system, and no way to sign in. Row level security policies are already written against `auth.uid()` on all three tables, so the privacy guarantee is in place and guarding nothing, because there has never been an authenticated request. Everything in Release 1 sits behind this: logging a spend needs an owner, this month's transactions needs a month, and where your money went needs a currency to display totals in.

Two values are currently server wide environment variables, `APP_CURRENCY` and `APP_TIMEZONE`. That was correct for a project with no accounts. It stops being correct the moment the app has a person in it, and it is wrong in a specific and consequential way for the timezone: `today()` decides which calendar day a spend lands on, and therefore which month it counts toward. A server in one region deciding the month boundary for a person in another is wrong exactly once a month, late in the evening, which is when someone checks what they spent.

The currency variable hides a second problem that is easy to miss. `lib/money.ts` divides the stored integer by one hundred, and the column is called `amount_cents`. For every currency with two decimal places this is correct. For the Japanese yen, the Korean won, and around twenty others, the minor unit is the currency itself: one yen is one minor unit, not one hundredth of anything. For the Kuwaiti dinar it is one thousandth. So the moment a person can choose their own currency, the divisor stops being a constant, and a name that says `cents` becomes a false statement embedded in a schema, a type, a formatter, and six test files.

The cost of deciding this now versus later is asymmetric to an unusual degree. The production database holds two test accounts and no real transactions. The change is a column rename and a lookup. After a year of daily logging it is a data migration on the only table whose values must never be wrong, performed on data that cannot be regenerated from anywhere.

There is no regulated compliance scope here. FinTrack holds no card numbers, no bank credentials, and no third party financial data; the bank connection that would trigger open banking rules is deferred to feature 19. What it does hold is one person's complete spending history, which is personal data worth protecting properly, so OWASP authentication and session practice applies and row level security is not optional.

## Options considered

### Option 1: A third party auth provider, currency stays in the environment

Bring in a hosted identity provider and keep the money and locale handling exactly as it is, deferring per user currency to a later release.

**Pros**:
- Smallest change to existing code, and nothing about money storage has to move.
- Hosted providers give passkeys, multi factor, and device management without writing any of it.

**Cons**:
- Row level security is written against the InsForge user id. A different identity provider means either bridging its tokens into InsForge's shape or rewriting every policy, which is the security critical layer.
- Spec 0001 explicitly declined Clerk and Better Auth on the grounds that the platform supplies auth. Reversing that needs a reason stronger than convenience.
- It leaves the `amount_cents` falsehood in place and growing, which is the expensive half of the problem, not the cheap half.

### Option 2: InsForge Auth, profile columns, currency aware minor units (chosen)

Use the platform's own authentication. Move currency and timezone onto `profiles`. Rename the money vocabulary from cents to minor units and take the decimal count from the currency.

**Pros**:
- The database keeps enforcing ownership through the same `auth.uid()` the policies already use, with no bridging layer.
- The falsehood is corrected while the table is empty, which is the cheapest it will ever be.
- Email verification, password reset, and Google are all native, and auth email delivery is included on the free plan, so no mail provider is needed.
- Currency and timezone become values a test can set per account, rather than process state a test has to mutate.

**Cons**:
- Touches around thirty files and makes two existing specs and one `AGENTS.md` rule out of date, all of which have to be corrected rather than ignored.
- Adds a database query to every server render that shows money or a date.
- The platform has no passkey support, so the strongest sign in method is unavailable.

### Option 3: InsForge Auth, keep cents, allow only two decimal currencies

Everything above, except the money code is left alone and the offered currency list contains only currencies with two decimal places.

**Pros**:
- Zero risk to the money path, and no rename, so the whole feature is meaningfully smaller.
- Covers the currencies most people using this app would actually pick.

**Cons**:
- It answers the question by refusing it. The yen case is not handled, it is excluded.
- The falsehood stays in the schema, so the eventual fix happens against real data instead of an empty table.
- An allowlist that exists to protect a hidden assumption is the kind of constraint whose reason gets forgotten, and then relaxed by someone who does not know why it was there.

### Option 4: InsForge Auth, currency stamped on every transaction

Everything in option 2, plus a currency and decimal count on each transaction row, so history keeps the currency it was written in and switching currency later is safe.

**Pros**:
- The only option where changing currency is a normal operation rather than a refusal.
- It is the shape genuinely multi currency support would need, so the eventual deferred feature would extend rather than replace it.

**Cons**:
- A month total spanning two currencies is not a number, so every aggregate in features 7, 8, 13, and 16 needs a rule for mixed currency that nothing in Release 1 can give it.
- Two extra columns on the largest table to support a scenario one person switching their own currency will hit approximately never.
- It designs for a scale of problem the engineer's answers do not describe, which is the classic way a simple app acquires a complicated core.

## Rationale

Option 2 wins on the asymmetry in Context rather than on elegance. The reason to act now is not that per user currency is urgently needed; it is that the window where correcting the unit costs a rename instead of a data migration is open right now and closes with the first real transaction. Option 3 is the honest competitor and it loses precisely there: it keeps a false statement in a money schema and hands the repair to a future maintainer working against irreplaceable data.

Option 1 fails on a project source rather than on merit. The row level security policies are the security critical layer, they are written against InsForge's token shape, and spec 0001 already recorded that as both the reason to use the platform's auth and the worst part of the vendor concentration to migrate. Introducing a second identity system would mean touching that layer for a benefit, passkeys and device management, that a single user personal tracker does not need.

Option 4 was the closest call. Stamping currency per transaction is correct in a way the chosen option is not: it makes changing currency safe rather than forbidden. It was rejected because of what it does downstream. Once a transaction can carry a currency, every total in features 7, 8, 13, and 16 has to answer what a mixed currency sum means, and Release 1 has no coherent answer without exchange rates, which are explicitly deferred. Refusing a currency change once history exists is a blunt rule, and it is a blunt rule that keeps every aggregate in the app a single unambiguous number. The engineer chose that tradeoff knowingly.

On passkeys, the engineer selected them before the platform's capabilities were checked, and they turned out not to exist on InsForge. The choice presented afterwards was to drop them, defer them, build WebAuthn directly, or substitute email codes; the engineer chose to drop them. That is the right call for this app: building WebAuthn correctly means a credential store, challenge generation, attestation verification, and session minting that agrees with an auth system you do not own, and it would be larger and riskier than everything else in feature 5 combined.

Two decisions were made against the grain of the engineer's first instinct and are worth naming. Choosing currency and timezone on the sign up form does not survive contact with Google sign in, which has no form, so a one time setup screen exists as well; that screen, not the form, is the guarantee that no value is ever guessed. And the profile columns had to become nullable to allow it, which reads like a weakening of the "required, no fallback" answer but is not: null means not chosen yet and routes to the setup screen, and no code path is permitted to read it as a default.
