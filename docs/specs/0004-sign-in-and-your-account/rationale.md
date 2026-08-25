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

Two decisions were made against the grain of the engineer's first instinct and are worth naming. Choosing currency and timezone on the sign up form does not survive contact with Google sign in, which has no form, so a one time setup screen exists as well; that screen, not the form, is the guarantee that no value is ever guessed. The build then found that the form does not survive contact with the platform either, and the setup screen became the only path rather than the fallback path, which is recorded below. And the profile columns had to become nullable to allow it, which reads like a weakening of the "required, no fallback" answer but is not: null means not chosen yet and routes to the setup screen, and no code path is permitted to read it as a default.

## Ratified at build time

Four things were built differently from what this spec first described. Each was agreed with the engineer during `/develop`, and each is now deliberated and written into the spec proper, so the spec describes what exists rather than what was hoped for. The criteria were amended in place rather than kept alongside a list of departures, because a spec that says two different things about one behaviour is worse than one that has visibly changed its mind.

Three of the four were forced by the platform and one was a free choice made better than the spec's. That distinction matters when reading them: a forced deviation is a fact to record, and a free one is a decision to defend.

### 1. Currency and timezone are answered on the setup screen, not the sign up form (forced)

The spec had the sign up form collect both and the new account trigger write all three columns in one insert. InsForge's signUp accepts an email address, a password, a name, a redirect, and an auto confirm flag, and its schema strips anything else, so `NEW.profile ->> 'currency'` and `NEW.profile ->> 'timezone'` were always null and always would be. There was no version of the original design that worked.

What was weighed instead of simply removing them: writing the two values from the client immediately after signUp, before verification. That was rejected because it puts a profile write in the one window where the account is least trustworthy, and because it makes the app the second writer of a row the database is supposed to own alone. Leaving the two reads in the trigger as harmless was also weighed and rejected for the reason this whole feature exists: SQL that asserts something untrue about the world is exactly what `amount_cents` was.

What it costs: one more screen between verifying your address and using the app, and a real window where an account exists with no currency. That window is closed in the database, not in the app. The `BEFORE INSERT` trigger on `transactions` refuses any amount while the profile is incomplete, so nothing can be recorded in a currency nobody chose. What it buys is one path to a complete profile instead of two, since a Google account was always going to need the setup screen anyway.

### 2. Password recovery is a six digit code, not an emailed link (forced)

The backend is configured `resetPasswordMethod: code`, so recovery emails a six digit code, which the app exchanges for a token before setting the password. The spec described a link carrying a token, with `insforge_status` on the landing URL to say whether it was used or expired. That URL does not exist here; the exchange call failing is what distinguishes a used or expired code, and it is a better signal because it is the platform's own answer rather than a parameter read back from a redirect.

The tail changed with it: after setting the password you land on `/sign-in` rather than in a session. The reset runs against a server client with no cookie writer, so there is no session to carry forward. Carrying it was weighed, and the engineer chose the sign in step: it is one interaction, and it proves the new password actually works rather than assuming it. This is the same six digit shape verification already uses, so the app now has one mental model for codes rather than two.

### 3. Changing a password proves mailbox control, not knowledge of the old one (forced, with a real cost)

The platform exposes sign up, sign in, verify, and reset by code, and no change password call at all. So changing a password while signed in runs the recovery flow against your own address, and the settings screen has no current password field.

This is the deviation with a genuine security consequence, and it was put to the engineer as its own decision rather than folded in with the rest. The alternative on the table was to add a current password field and check it server side with a silent sign in call against your own address before sending the code. That would restore the original guarantee. It was rejected because of what it actually buys: the code still has to be read from the mailbox, so a stolen live session alone cannot complete the change either way, and every other session ends when it succeeds. The field would defend only against somebody holding a live session and the mailbox at once, at the cost of a second failure mode on the settings screen and one more platform call that can be wrong. The engineer accepted the weaker guarantee knowingly.

What the spec now does instead of pretending: AC-17 states which guarantee is on offer, the security model names it as deliberately weaker than the usual advice, and the screen says it in plain words to the person using it.

One thing this deviation created that the spec had not accounted for: the password change is a mail sender reachable by any signed in session, and Arcjet was wired to sign in, sign up, and password reset only, because those were the three surfaces that existed when attempt limiting was specced. AC-8 now names the fourth, and build step 11 existed because the code did not yet meet it. Stating a criterion the build fails is the honest way round; trimming the criterion to match the code would have hidden it. Step 11 has since been built, and the criterion held rather than being quietly relaxed.

### 4. Account deletion is a database function, not an edge function (chosen, and better)

The spec called for an InsForge edge function holding an elevated credential, because the SDK exposes no self deletion. The build used a `SECURITY DEFINER` Postgres function instead, `public.delete_own_account()`, taking the account from `auth.uid()`.

This is the one deviation that is a free choice, and it is the better answer on three counts. It takes no parameter, so a caller cannot name another account because there is nowhere to name one; the edge function would have had to authenticate a token and derive an id, which is code that can be got wrong. It stores no admin credential anywhere, so there is nothing to leak or rotate. And it is not a second deployable artifact with its own lifecycle, versioning, and deploy step, which for a one person project is a real ongoing cost.

What it costs is honest: it is the only `SECURITY DEFINER` function in this feature, it ignores row level security by design, and it is the only code in the project that can delete from `auth.users`. Spec 0001 rule 7 permits exactly this shape provided the function filters by the caller's id by hand and carries a comment saying why it exists, and both hold. The edge function stays worth remembering as the runner up: it becomes the right answer the day deletion needs to do something outside the database as well, such as revoking a third party token or deleting an uploaded file, which is plausible at feature 19.
