# 0004a. Authentication and session

Child of [0004 sign in and your account](index.md). Covers proving who you are and staying signed in. The currency and timezone half lives in [0004-money-units-and-locale.md](0004-money-units-and-locale.md).

## Summary

You sign up with an email address and a password, or with Google. Either way you land on the same account, and either way you answer two questions on a setup screen before the app opens, because the platform's signup carries a name and nothing else. A new email account confirms a six digit code before it can reach anything, which is what makes the password reset path trustworthy later. The session lives in a cookie the browser cannot read and refreshes quietly, so daily use never hits a sign in wall, and every page except the auth screens is closed to a visitor without one.

## Inline rationale

InsForge Auth is used because the row level security policies on all three tables are already written against its user id, so any other identity system would mean rewriting the security critical layer for no gain a single user app can spend. Verification is by six digit code rather than emailed link so signing up never leaves the tab it started in. The session is long lived because this is a personal tracker opened daily and an expiring session is a daily tax for a threat, a stolen laptop, that a short window barely mitigates. Passkeys were chosen by the engineer and then found to be unsupported by the platform; building WebAuthn directly was weighed and rejected as larger and riskier than the rest of this feature combined.

Two shapes here were settled against the platform rather than chosen freely, and both were ratified after the build rather than before it. Password recovery is a six digit code rather than an emailed link because the backend is configured `resetPasswordMethod: code`, which also keeps recovery in the same tab as everything else. Changing a password while signed in runs that same recovery flow against your own address, because the platform exposes no change password call to check an old password against: there is sign up, sign in, verify, and reset, and nothing else. That trades knowledge of the old password for control of the mailbox. It was accepted rather than papered over, because the alternative, a current password field checked by a silent sign in call against your own address, adds a second failure mode to the settings screen to restore a guarantee that a stolen live session already cannot defeat on its own.

## Feature design

**Data model sketch**:

No new tables. This child reads `auth.users`, which InsForge owns, and depends on the `profiles` row that spec 0002's `handle_new_user()` trigger creates.

| Source | Field | Notes |
|---|---|---|
| `auth.users.id` | `uuid` | The identity every row level security policy keys off. Already referenced by all three tables |
| `auth.users.email` | `text` | Owned by the platform. The value the delete confirmation asks you to type |
| `auth.users.profile` | `jsonb` | The signup payload. Carries `name` and only `name`: the signUp schema strips anything else, so currency and timezone cannot travel here and are collected on the setup screen instead |
| session | access token | Short lived, readable by the browser client, sent as the bearer token |
| session | refresh token | `httpOnly` cookie, never reaches any script, exchanged through `/api/auth/refresh` |

**State transitions**:

Account: `created, unverified` → `verified` (six digit code accepted) → `complete` (currency and timezone set, see the other child) → `deleted` (irreversible, cascade).

Session: `none` → `active` (sign in, or verification succeeding, or OAuth exchange) → `refreshed` (silent, repeatedly) → `none` (sign out, or refresh rejected).

A Google account skips `created, unverified` entirely, because Google has already verified the address, and arrives directly at `verified` but not `complete`. A password account reaches `verified` but not `complete` too, so `verified` to `complete` is one shared step for both, not a Google only branch.

**API surface**:

Server actions through `createAuthActions`, plus one Route Handler for the OAuth callback, because a redirect from Google is a GET request and not an action.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `signUpWithPassword` (action) | POST | `email:string` (req), `password:string` min 12 (req), `displayName:string` (opt) | `{ needsVerification: true, email }` | public | invalid input, rate limited, taken address handled silently |
| `verifyEmailCode` (action) | POST | `email:string` (req), `otp:string` 6 digits (req) | session cookies set, redirect target | public | code wrong or expired, rate limited (owed by build step 11) |
| `resendVerification` (action) | POST | `email:string` (req) | `{ sent: true }` | public | rate limited (owed by build step 11; it sends mail on every call and is not limited yet) |
| `signInWithPassword` (action) | POST | `email:string` (req), `password:string` (req) | session cookies set, redirect target | public | wrong credentials, unverified address, rate limited |
| `initiateGoogleOAuth` (action) | POST | none | `{ url }`, `codeVerifier` stored server side | public | provider unavailable |
| `/auth/callback` (route) | GET | `code` (req) from Google | redirect, session cookies set | public | exchange failed, user denied consent |
| `signOut` (action) | POST | none | cookies cleared, redirect to sign in | signed in | none that change caller behaviour |
| `requestPasswordReset` (action) | POST | `email:string` (req) | `{ sent: true }` always | public | rate limited only |
| `setNewPassword` (action) | POST | `email:string` (req), `code:string` 6 digits (req), `password:string` min 12 (req) | redirect to `/sign-in?reset=done`, other sessions ended | public, the code is the proof | code used or expired (the exchange fails), password too short |
| `requestPasswordChange` (action) | POST | none, the address comes from the session | `{ status: 'ok' }`, a six digit code emailed to your own address | signed in | send failed |
| `changePassword` (action) | POST | `code:string` 6 digits (req), `password:string` min 12 (req) | `{ status: 'ok' }`, other sessions ended | signed in | code wrong or expired |
| `deleteAccount` (action) | POST | `confirmEmail:string` (req) | cookies cleared, redirect | signed in | typed address does not match, function unreachable |
| `public.delete_own_account()` (database function) | RPC | none at all | void | signed in | `insufficient_privilege` when `auth.uid()` is null. `SECURITY DEFINER`, takes the account from `auth.uid()`, deletes that one `auth.users` row and nothing else. `EXECUTE` revoked from `PUBLIC` and `anon`, granted to `authenticated` |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| every protected render | the signed in user id | the access token cookie, read by `createServerClient` in `lib/insforge-server.ts` |
| `signUpWithPassword` | `profiles.display_name` | the form field, carried in the signUp profile payload, written by `handle_new_user()` reading `NEW.profile ->> 'name'` |
| `signUpWithPassword` | whether the address is already taken | never displayed. The response is identical either way, and the platform emails the existing account instead |
| `verifyEmailCode` | the six digit code | the email InsForge sends. Never generated or stored by this app |
| `/auth/callback` | the OAuth `codeVerifier` | produced by `initiateGoogleOAuth` and held server side, never sent to the browser |
| `requestPasswordReset` | the on screen message | a constant string, deliberately not derived from whether the account exists |
| `setNewPassword` | whether the code is used or expired | the failure of `exchangeResetPasswordToken`, which is the only thing that can tell the two apart from a used one. There is no landing URL to read a status from, because recovery is a code |
| `setNewPassword` | the address the code belongs to | the `email` query parameter carried from the request screen, prefilled and editable. The code is what actually authorises, so a tampered address only fails the exchange |
| `requestPasswordChange` | the address the code is sent to | `auth.users.email` for the signed in account. Never a form field, so this cannot be aimed at anybody else's mailbox |
| `deleteAccount` | the address you must type | `auth.users.email` for the signed in account, fetched at render, compared server side |
| proxy route decision | is this request signed in | the access token cookie, refreshed by `updateSession` in `proxy.ts` before any Server Component renders |
| proxy route decision | is this profile complete | `getSettings()`, defined in the other child. This child never inspects the columns itself |
| rate limit decision | the caller identity | the request, passed to Arcjet. No account identity is required, since sign in attempts are unauthenticated by definition |
| sign in, verification, OAuth exchange | the redirect target after success | the constant `/`. Not a query parameter and not a stored intent, because the chosen protection model does not remember where you were headed |
| verification screen | the email address being verified | returned by `signUpWithPassword` and carried to `/verify` as a query parameter, prefilled and editable. The six digit code is what actually authenticates, so a tampered address gains nothing |
| expired reset screen | how to get a fresh code | a link back to the request reset form. The address is already in hand from the query parameter, so it is prefilled there rather than retyped |
| `deleteAccount` | the actual removal of the account | `public.delete_own_account()`, called by RPC. The InsForge SDK exposes no self deletion. The account id inside it comes from `auth.uid()` and from nothing the caller sent |

**Key invariants**:

- Anything that starts or ends a session runs on the server. The browser client's auth surface stays read only, so the refresh token is never reachable by a script.
- No screen other than sign in, sign up, verification, password reset, and `/auth/callback` renders without a valid session. The setup screen requires a session and is exempt from the completeness redirect only.
- The reset request response is byte identical for a known and an unknown address.
- A code, whether for verification, recovery, or a password change, is generated and delivered by the platform. This app never generates one, never stores one, and never compares one itself: it hands the code back and reads whether the platform accepted it.
- Submitting a code is attempt limited, not only requesting one. Six digits is a million combinations, and both recovery and the password change rest entirely on a code not being guessable inside its window, so an unlimited guess loop would defeat the guarantee either one claims to offer. This holds regardless of what the platform does on its own side, because a limit nobody here configured is a limit that can change without notice.
- A password change is authorised by a code sent to the account's own address, read from `auth.users.email` and never from a form field. It proves control of the mailbox, not knowledge of the old password, and the screen states that rather than implying otherwise.
- A password is at least 12 characters. No composition rule is imposed, because forced symbols and digits reliably produce weaker passwords than length does.
- Account deletion is immediate and total. There is no soft delete, no marked state, and no grace period, so data the person asked to be gone is gone.
- The redirect target after a successful sign in, verification, or OAuth exchange is the constant `/`. No query parameter influences it, so the sign in page cannot be used to bounce anyone to another site.
- Changing or resetting a password ends every other active session for that account, so a stolen cookie does not outlive the password it was taken under.
- Arcjet fails open. When it cannot be reached the request proceeds and the failure is logged, because locking the owner out of their own financial history is worse than a window with no attempt limiting.
- `public.delete_own_account()` deletes the calling account and nothing else. It takes no parameter at all, so there is no argument through which another account could be named, and it raises rather than deleting when `auth.uid()` is null. It is the only code in the project that can touch `auth.users`. It is not the only `SECURITY DEFINER` function here: `handle_new_user()` from spec 0002 is one too, and this feature rewrote it, so any review of elevated privilege in this project covers both.

**Security model**:

One account, one owner, no roles, no sharing. Authorisation is entirely ownership: the row level security policies from spec 0002 compare `user_id` to `auth.uid()` and there is no second dimension. Because there is no admin role and no cross account read anywhere, there is no privilege escalation surface to design against.

One authorisation property is deliberately weaker than the usual advice, and it is named here rather than left for someone to discover. Changing a password while signed in does not require the old password, because the platform has no call that checks one. The control that replaces it is the mailbox: the code goes only to the address on the account, and a change that succeeds ends every other session. So a live session alone cannot change a password, and a mailbox alone cannot either without a live session. What is lost against the original design is defence against somebody who has both, which for a single person tracker is a laptop and a mail client left open together.

Compliance scope: none triggered. FinTrack stores no card data, no bank credentials, and no third party financial data at this release, so PCI DSS and open banking rules do not apply; feature 19 is where that changes. It does hold one person's complete spending history, so OWASP authentication and session practice is the standard applied: verified addresses, server side session mutation, an `httpOnly` refresh token, silent refresh, attempt limiting, and no account enumeration.

Audit logging is deliberately not added. The guidance to log every mutation touching money exists for systems where one party acts on another party's money; here the only actor is the owner, and a log of your own actions readable only by you adds a table and answers no question.

**Configuration required**:

- `ARCJET_KEY`: the Arcjet site key for rate limiting and bot detection on the auth actions. Add to `lib/env.ts` and the Vercel project before build step 9
- Google OAuth client id and secret: created in the Google Cloud console, entered in the InsForge dashboard, not in this repository. The provider callback points at the InsForge project URL, and `redirectTo` points at this app's `/auth/callback`
- No credential is needed for account deletion. `public.delete_own_account()` ships as a migration and holds its privilege through `SECURITY DEFINER` ownership rather than through a stored secret, so there is nothing here to rotate or to leak
- The backend's `resetPasswordMethod` must stay `code`. Recovery and the password change both exchange a six digit code for a token; switching that setting to a link breaks both screens, and it is backend configuration rather than anything in this repository

**Critical test scenarios**:

- Happy path: sign up with an email address, a password, and a name, enter the emailed code, arrive at the setup screen, answer both questions, land on the signed in home, close the browser, reopen it, and still be signed in, verifies **AC-1**, **AC-2**, **AC-4**, **AC-14**.
- Happy path: sign in with Google, get routed to the setup screen because the profile is incomplete, complete it, and land on the same home a password account lands on, verifies **AC-3**, **AC-14**.
- Failure case: request a password reset for an address with no account and get the same response and the same timing as for one that exists, verifies **AC-7**.
- Failure case: enter a reset code twice; the second attempt says the code is used or expired and offers a fresh one rather than failing opaquely, verifies **AC-7**.
- Failure case: exceed the sign in attempt limit and receive a plain readable message, not a stack trace or a blank page, verifies **AC-8**.
- Auth/permission: request any protected page with no session and with a deliberately corrupted session cookie; both redirect to sign in and neither renders any account data, verifies **AC-6**.
- Auth/permission: signed in as account A, attempt to read and to update account B's profile row; both return nothing or are refused, verifies **AC-19**.
- Failure case: change your password in one browser using the emailed code and confirm a session open in a second browser stops working on its next request, verifies **AC-17**.
- Failure case: make Arcjet unreachable and confirm sign in still succeeds and the failure is logged, verifies **AC-8**.
- Auth/permission: signed in as account A, call `delete_own_account()` while attempting to name account B; the function takes no parameter, so account B survives and only A is removed, verifies **AC-18**, **AC-19**.
- Cleanup: delete an account after typing its address, then confirm no `profiles`, `categories`, or `transactions` row survives, verifies **AC-18**.
