# 0004. Sign in and your account

**Date**: 2026-08-20
**Status**: Accepted

## Summary

FinTrack gets one account that is yours, guarded by InsForge Auth. You sign up with an email address and a password, or with Google, and you verify your address with a six digit code before anything is readable. Every account then answers two questions once, on a setup screen: which currency, and which time zone. Your currency and your timezone become facts on your profile rather than settings of the server, which forces one correction that is cheap now and expensive later: an amount is stored as a whole number of **minor units** (the smallest unit a currency has, one cent for a dollar but one whole yen for a yen), not as cents. The column `amount_cents` becomes `amount_minor`, and the number of decimal places comes from the currency rather than from a hardcoded two.

## Structure

This is an umbrella spec. It holds the contract, the plan, and the seam between two decisions that ship together but are reasoned separately.

- **[0004-auth-and-session.md](0004-auth-and-session.md)**: how you prove who you are and stay signed in. Sign in methods, email verification, session lifetime, route protection, password recovery, attempt limiting, and account deletion. Supports the decision on identity.
- **[0004-money-units-and-locale.md](0004-money-units-and-locale.md)**: how money is stored and read for any currency, and how your currency and timezone reach server code. The minor units rename, the supported currency list, the currency lock, timezone validation, and the per request settings loader. Supports the decision on money correctness.

Reasoning and options: see [rationale.md](rationale.md).

## Cross child contract

The two children meet at exactly three places. Neither child may change these alone.

1. **The profile row is shared and is created once, by the database.** `handle_new_user()` from spec 0002 stays the only thing that inserts a `profiles` row. Auth owns when it fires; locale owns which columns it fills. Neither child adds a second insert path. The trigger fills the display name and nothing else, because the platform's signUp payload carries a name and strips anything further, so the two locale columns start null and are filled later by one update from the setup screen. An update is not a second insert, and the setup action is the only writer of it.
2. **A profile is either complete or incomplete, and only locale defines the test.** Complete means `currency` and `timezone` are both set. Auth reads that boolean to decide routing and never inspects the columns itself.
3. **`getSettings()` is the single read path.** Auth resolves the signed in user id; locale resolves that id into currency, timezone, and display name. Every server module that needs any of the three calls this one function, and no module reads `APP_CURRENCY` or `APP_TIMEZONE` for a signed in person ever again.

## Requirements

**User stories**:

- As the person using FinTrack, I want an account of my own so my spending follows me from laptop to phone and nobody else can read it.
- As the person using FinTrack, I want to get back in when I forget my password, without asking anyone for help.
- As the person using FinTrack, I want my amounts shown in my own currency, correctly, whether that currency has two decimal places, none, or three.
- As the person using FinTrack, I want the app to agree with me about what day it is and when my month ends, wherever the server happens to run.
- As the person maintaining FinTrack, I want the currency assumption fixed while the database is still empty, rather than after two years of entries depend on it.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: Creating an account with an email address, a password of at least 12 characters, and a display name produces a `profiles` row carrying that display name, written by the database trigger in a single insert with no follow up write from the app. The currency and the time zone are not on the sign up form: InsForge's signUp accepts an email address, a password, a name, a redirect, and an auto confirm flag, and strips anything else, so those two are answered once on the setup screen instead. Until they are answered the profile is incomplete and the database refuses every transaction for it.
- **AC-2**: A new account cannot reach any signed in screen until it enters the six digit code emailed to it. An unverified sign in attempt says so plainly and can request a fresh code.
- **AC-3**: Signing in with email and password, and signing in with Google, both end on the same signed in home for the same account.
- **AC-4**: A session survives closing and reopening the browser and keeps working for at least a week without signing in again, refreshing without the person noticing.
- **AC-5**: Signing out ends the session, and every protected page is unreachable on the next request.
- **AC-6**: A request without a valid session to anything other than sign in, sign up, email verification, password reset, and the OAuth callback is redirected to sign in and renders no account data at all. The setup screen is not on that list: it requires a session, and is exempt only from the completeness redirect, which is a different rule.
- **AC-7**: Requesting a password reset returns an identical response whether or not that address has an account. Entering the six digit code that arrives by email sets a new password and returns you to sign in, where the new password works; a used or expired code says which and offers a fresh one. It is a code rather than a link because this backend is configured `resetPasswordMethod: code`, and you are returned to sign in rather than signed in because the reset runs on a server client with no cookie writer, so there is no session to carry.
- **AC-8**: Repeated attempts from one source are refused after a limit, and the refusal reads as a plain message rather than an error page. This covers every action that sends an email (sign up, verification resend, password reset, password change) and every action that submits a guessable value: a password on sign in, and a six digit code on verification, on password reset, and on password change. Submitting a code is limited as strictly as requesting one, because a six digit code is a million tries and the whole trust model of recovery and of the password change rests on it not being guessable inside its window. When the limiter itself is unreachable the request is allowed through and the failure is logged, so an outage in it never locks you out of your own account.
- **AC-9**: Every money amount is stored as a whole number of minor units in `transactions.amount_minor`. No column, type, function, or test name in the repository asserts that a minor unit is one hundredth of the currency.
- **AC-10**: The single stored integer 500 renders as ¥500 on a JPY profile, $5.00 on a USD profile, and a three decimal amount on a KWD profile, with no branch anywhere outside `lib/money.ts`.
- **AC-11**: The currencies offered at sign up come from one supported list, and the database rejects any code outside it. An automated test fails if the TypeScript list and the database table disagree on any code or any decimal count.
- **AC-12**: Once at least one transaction exists for an account, the database refuses a change to that account's `profiles.currency`, and settings presents currency as fixed with the reason in plain words. The database also refuses a transaction insert for an account whose profile is incomplete, so no amount can ever exist in a currency nobody chose.
- **AC-13**: Today's date and the month boundaries used by any query or screen come from the signed in profile's timezone. No signed in code path reads `APP_TIMEZONE`, the server clock, or the browser clock to decide them.
- **AC-14**: A profile missing its currency or its timezone is routed to a one time setup screen before any other signed in page, and completing that screen is what every new account encounters, whether it signed up with a password or with Google.
- **AC-15**: When the profile cannot be loaded or is missing, the app shows a plain error and renders no money amount anywhere on the page.
- **AC-16**: You can change your display name and your timezone at any time. You can change your currency only while the account has no transactions.
- **AC-17**: You can change your password while signed in by entering a six digit code sent to your own address, and the old password stops working immediately afterwards. There is no current password field, because the platform exposes no change password call at all: what the code proves is control of the mailbox rather than knowledge of the old password, and the screen says so. Changing or resetting a password ends every other active session for that account.
- **AC-18**: Deleting your account requires typing your own email address, then removes the profile, every category, and every transaction, leaving no orphaned row in any table. The removal runs through a database function that takes the account to delete from the verified session and never from anything the caller sent, so there is no argument through which another account could be named.
- **AC-19**: Only your own profile, categories, and transactions are readable and writable. Every attempt against another account returns nothing or is refused, proven by a test signing in as two real accounts.

## Decision

**Chosen option**: Option 2: InsForge Auth for identity, with currency and timezone as profile columns and money stored in currency aware minor units.

Use the platform's own authentication for email and password, Google, verification, and password reset; move currency and timezone from environment variables onto the `profiles` row; and rename the money column and its whole vocabulary from cents to minor units so a zero decimal currency is correct by construction rather than by exception.

**Implementation skills**: `insforge` (`InsForge`, `~/.agents/skills/insforge/`) · `insforge-cli` (`InsForge`, `~/.agents/skills/insforge-cli/`) · `arcjet` (`arcjet/skills`, `.agents/skills/arcjet/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`)

## Build plan

Ordered by the Skateboard approach: the thinnest usable whole first, then grown a release at a time. Steps 1 to 3 come before any screen because they change vocabulary that every later screen speaks, and doing that while the production database is still empty is the entire reason this is cheap today.

1. **Rename cents to minor units across the repository.** Migration renaming `transactions.amount_cents` to `amount_minor` and its check constraint. Rename the `Cents` type to `MinorUnits`, `formatCents()` to `formatAmount()`, and update `lib/schema.ts`, `components/ui/Amount.tsx`, `app/design/page.tsx`, `docs/design.md`, and every affected test. No behaviour change: a two decimal currency renders exactly as before. Satisfies **AC-9**.
2. **Add the currency list and the profile columns.** Migration creating `public.currencies` seeded with the twenty supported codes and their decimal counts, the nullable `profiles.currency` with its foreign key, the nullable `profiles.timezone` with its validation against `pg_timezone_names`, row level security allowing any signed in account to read `currencies`, the `BEFORE UPDATE` trigger that refuses a currency change once a transaction exists, and a `BEFORE INSERT` trigger on `transactions` refusing a write while that account's profile is incomplete. Create `lib/currency.ts` as the typed mirror. Satisfies **AC-11**, **AC-12**.
3. **Make money and time read the profile.** Leave `handle_new_user()` writing the display name and nothing else: the signUp payload carries no currency and no time zone, so reading them there would always return null. Both columns stay null until the setup screen in step 6 fills them, and the completeness trigger from step 2 is what keeps that gap safe. Add `getSettings()` in `lib/settings.ts`, wrapped in React `cache()`, returning a discriminated union of `{ isComplete: true, currency, decimals, timezone, displayName }` or `{ isComplete: false, displayName }`, and throwing rather than defaulting when the profile is absent or unreadable. Change `formatAmount()` and `currencySymbol()` to take decimals from the currency, and `today()` and `currentMonthRange()` to require a timezone argument. `monthRange()` already takes a plain date and needs no timezone, so it does not change. Add the drift test asserting `lib/currency.ts` and the `currencies` table agree. Satisfies **AC-10**, **AC-11**, **AC-13**, **AC-15**.
4. **Sign up, verify, sign in, sign out, and lock the doors.** The `(auth)` route group on the `AuthLayout` from spec 0003: sign up collecting email, password, and display name; the six digit verification screen; sign in; and a sign out action. Server actions through `createAuthActions`. Route protection in `proxy.ts` sending every unauthenticated request to sign in. A placeholder signed in home on `AppShell` and `AppNav` naming what arrives with feature 6. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**.
5. **Password recovery.** Request reset and set new password screens, with an identical response for a known and an unknown address, and explicit handling of a consumed or expired code. Recovery is by six digit code, not by link, because the backend is configured `resetPasswordMethod: code`, so the screen takes the address, the code, and the new password; the code is exchanged for a token first, and a used or expired code fails that exchange, which is the message worth showing. Setting the password ends on `/sign-in` rather than in a session. Satisfies **AC-7**.
6. **The setup screen and Google.** The one time screen collecting currency and timezone for an incomplete profile, which is now the path every new account takes rather than a Google only branch, the routing rule that sends any incomplete profile there first, the Google OAuth initiation action, and the callback Route Handler doing the manual code exchange so the refresh token stays in an httpOnly cookie. Confirm on the test project what actually happens when a Google address matches an existing password account, and write the answer into this spec. Satisfies **AC-3**, **AC-14**.
7. **Account settings.** Change display name and timezone; currency shown as changeable only while no transaction exists, and as fixed with a reason otherwise; and change password, which asks for a code sent to your own address rather than for your current password, and says on screen what that code proves. Satisfies **AC-16**, **AC-17**.
8. **Account deletion.** The InsForge SDK exposes no self deletion, so this needs a `SECURITY DEFINER` function `public.delete_own_account()` that takes the account from `auth.uid()`, refuses an unauthenticated caller, and deletes that one `auth.users` row, letting the cascade from spec 0002 remove the profile, the categories, and every transaction. It takes no parameter, so there is nothing to tamper with. `EXECUTE` is revoked from `PUBLIC` and from `anon` and granted to `authenticated` only, and the function carries the comment spec 0001 rule 7 requires of any `SECURITY DEFINER` function. Plus the confirmation screen asking you to type your own email address, checked server side against the signed in address. Satisfies **AC-18**.
9. **Attempt limiting.** Arcjet on sign in, sign up, and password reset, with rate limiting and bot detection, surfacing a plain message when it refuses, and configured to fail open with a logged warning when Arcjet itself cannot be reached. Satisfies **AC-8**.
10. **Prove it.** Extend the row level security integration test to cover `profiles` writes and the `currencies` read across two real accounts, add the zero decimal and three decimal formatting tests, add the currency lock test, and run the accessibility check over every new screen. Satisfies **AC-11**, **AC-12**, **AC-19**, and confirms **AC-10**.
11. **Finish the attempt limiting.** Step 9 guarded the three actions that existed when it was written: sign in, sign up, and password reset. Five more need it, and they fall into two groups.
    - **Mail senders**: `requestPasswordChange`, which did not exist when step 9 was written, and `resendVerification`, which did and was missed. Both send an email on every call; the API table already claims `resendVerification` is limited and the code does not limit it.
    - **Code submitters**: `verifyEmailCode`, `setNewPassword`, and `changePassword`. None of these is limited today, so nothing in this app counts wrong guesses at a six digit code. Whether InsForge throttles `exchangeResetPasswordToken` and its verification call on its own side is **unverified**: confirm it on the test project and write the answer here rather than assuming either way. A platform side limit does not remove the need for one here, because a limit you did not configure is a limit that can change without telling you.
    - Key the signed in actions on the account id as well as the request source. `lib/attempt-limit.ts` keys on the request alone, which is right for the public forms where there is no account yet and wrong for a signed in one: `auth.uid()` is in hand, and without it somebody rotating addresses can still aim an unbounded run of codes at one mailbox. Satisfies **AC-8**.

## Consequences

**Positive**:

- The currency assumption is corrected while the production database holds nothing but two test accounts. The same change after a year of daily entries would be a data migration under pressure rather than a rename.
- Row level security already keyed to the InsForge user id starts actually protecting something, because until now there was no way to be signed in.
- `today()` and `monthRange()` become pure functions of their arguments instead of reading a module level environment variable, which makes the month boundary logic testable without setting process state.
- Three of the four accounts settings, and the whole protected route surface, are reusable by every later release without change.

**Negative / tradeoffs**:

- Currency is effectively permanent. The moment you log your first spend you are committed, and the only honest way out is export and start again. This is a real cost accepted deliberately, because every alternative either rewrote history or invented an exchange rate.
- The rename touches around thirty files including `AGENTS.md` and `docs/design.md`, and it makes a line in spec 0002 and a line in spec 0001 out of date. Those need correcting rather than leaving as quiet contradictions.
- `getSettings()` adds one database query to every server render that shows money or a date. For one person this is irrelevant, and it is the cost of the values being per user at all.
- Two sign in methods means two paths to reconcile forever, and one of them, Google, is a dependency you do not control and cannot fix at 2am.
- Passkeys are not available on this platform, so the strongest phishing resistant option is off the table until InsForge adds it or somebody builds WebAuthn here.
- Changing your password proves you can read your mailbox, not that you know your current password, because the platform exposes no change password call to check the old one against. Someone sitting at your unlocked, signed in laptop still cannot complete the change without your mailbox, and every other session ends when it succeeds, so the practical gap is narrow. It is still a weaker guarantee than the one this spec first promised, and the settings screen says which guarantee it is offering rather than implying the stronger one.
- Arcjet adds an external service in the request path of the sign in page. It is configured to fail open, which means an Arcjet outage silently removes attempt limiting rather than locking anyone out.
- Account deletion needs a `SECURITY DEFINER` database function, because the SDK has no self deletion call. It runs as its owner and therefore ignores row level security, which is the one privilege escalation shape this project otherwise has none of. What keeps it safe is that it takes no argument at all: the account comes from `auth.uid()` and there is nowhere to name another. Anyone editing that function is editing the most dangerous nine lines in the repository, which is why the comment above it is as long as it is.

**Neutral**:

- Every account, password or Google, passes through the setup screen, so there is one path to a complete profile instead of two. That is simpler than the spec's original shape, and it costs one extra screen between verifying your address and seeing the app.
- `APP_CURRENCY` and `APP_TIMEZONE` do not disappear. They stop being the app's truth and become the values the setup screen preselects, which is a real demotion worth stating in `lib/env.ts` so nobody restores their old meaning.
- Google OAuth needs credentials created in the Google Cloud console and entered in the InsForge dashboard before step 6 can be built or tested. This is manual setup outside the repository.
- A new `currencies` reference table exists that no product feature reads directly; it is there so the database can refuse a bad code.

## Follow-up

- [ ] Correct spec [0002](../0002-data-model/index.md) where it names `amount_cents` and describes money as cents, and correct spec [0001](../0001-stack-and-architecture/index.md) where it says amounts are integer cents. Both are right about the principle, exact integers, and out of date about the unit.
- [ ] Correct rule 1 in `AGENTS.md`, which currently reads "Money is integer cents everywhere". It should say minor units, and say that the decimal count comes from the currency. `/sync` owns that edit, not this spec.
- [ ] Record what actually happens when a Google address matches an existing password account, from step 6, and write the observed behaviour into [0004-auth-and-session.md](0004-auth-and-session.md) rather than leaving it as an open question.
- [ ] Create the auth area context file `app/(auth)/AGENTS.md` once the routes exist, holding the InsForge auth conventions. They are area specific, so they do not belong in root `AGENTS.md`, which loads on every task.
- [ ] `ARCJET_KEY` must be added to `lib/env.ts` and to the Vercel project before step 9, and the Arcjet account created.
- [ ] Build step 11: five actions in `actions/auth.ts` are not behind `refuseIfTooManyAttempts()`, so AC-8 does not hold yet. Two send mail (`requestPasswordChange`, `resendVerification`) and three accept a six digit code (`verifyEmailCode`, `setNewPassword`, `changePassword`). This is the one criterion this spec now states that the code does not meet, and it is stated that way deliberately rather than trimmed to match.
- [ ] Confirm on the test project whether InsForge rate limits code exchange on its own side, and write the observed answer into build step 11. Until it is confirmed, treat the guess window as unprotected.
- [ ] `actions/settings.ts` recognises the currency lock refusal by matching `/currency cannot change/i` against the exception text raised in `migrations/20260819224157_currencies-and-profile-locale.sql`. Nothing pins that string, so editing the trigger message silently degrades the plain words explanation AC-12 promises into a generic error. `/test` should pin it, or the action should key off the error code instead of the text.

## Rationale

Reasoning, the options weighed, and what was rejected: see [rationale.md](rationale.md).
