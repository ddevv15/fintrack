# Verify: sign in and your account · spec 0004 · updated 2026-08-20

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Four things were built differently from the spec, each agreed with the engineer during `/develop`. The steps below check what was actually built, and each one says so where it differs. `/architect` still owes the wording.

## UI / manual

### Creating an account

- [ ] Visit `/sign-up` → three fields only: email, password, your name. No currency and no time zone → AC-1 _(differs: the spec put them here. InsForge's signUp carries no profile payload, so they moved to `/setup`)_
- [ ] Submit with a password under 12 characters → refused, message beside the password field, and the email you typed is still there → AC-1
- [ ] Sign up with a real address → lands on `/verify` with the address prefilled → AC-2
- [ ] While unverified, open `/` in a new tab → redirected to sign in, no account data on screen → AC-2, AC-6
- [ ] Enter the six digit code from the email → signed in, and sent straight to `/setup` → AC-2, AC-14
- [ ] Enter a wrong code first → says it is wrong or expired and offers a fresh one; "Send another code" delivers one → AC-2
- [ ] On `/setup`, choose a currency and a time zone → lands on the signed in home showing both → AC-14
- [ ] Check the database: the profile row carries the display name from sign up, and the currency and zone from setup → AC-1

### Signing in and staying signed in

- [ ] Sign out, then sign in with the same address and password → same account, same home → AC-3
- [ ] Sign in with Google → same home, and a brand new Google account stops at `/setup` first → AC-3, AC-14
- [ ] Close the browser entirely, reopen it, visit `/` → still signed in, no sign in wall → AC-4
- [ ] Leave it a week and return → still signed in → AC-4
- [ ] Sign out from `/settings` → every protected page redirects to sign in on the next request → AC-5

### The doors

- [ ] With no session, visit `/`, `/settings`, `/setup` → each redirects to `/sign-in` and renders no account data → AC-6
- [ ] Tamper with the `insforge_access_token` cookie, then visit `/` → redirected to sign in, not a half signed in page → AC-6
- [ ] Signed in, visit `/sign-in` → redirected home rather than shown a useless form → AC-6
- [ ] Confirm `/sign-in`, `/sign-up`, `/verify`, `/forgot-password`, `/reset-password`, and `/auth/callback` all load with no session → AC-6

### Forgetting your password

- [ ] `/forgot-password` with an address that has an account, and one that does not → identical screen, identical wording, similar timing → AC-7
- [ ] Enter the emailed code and a new password → says it is done, then signing in with the new password works → AC-7 _(differs: a six digit code, not a link. This backend is configured `resetPasswordMethod: code`)_
- [ ] Use the same code a second time → says it is used or expired and offers a fresh one → AC-7
- [ ] Sign in with the old password → refused → AC-17

### Your account

- [ ] `/settings` → change your display name → saved, and the home greeting changes → AC-16
- [ ] Change your time zone → saved → AC-16
- [ ] With no entries logged, the currency is a picker; log one entry, reload → the currency reads as fixed with the reason in plain words → AC-12, AC-16
- [ ] Change your password from `/settings` using the emailed code → the old one stops working → AC-17 _(differs: no current password field. The platform exposes no change password call at all)_
- [ ] With a second browser signed in on the same account, change the password in the first → the second stops working on its next request → AC-17
- [ ] Delete the account: typing the wrong address is refused; typing your own removes it → AC-18
- [ ] After deleting, check the database → no `profiles`, `categories`, or `transactions` row survives for that id → AC-18

### Attempt limiting

- [ ] With `ARCJET_KEY` set, submit sign in wrongly eleven times in a minute → a plain readable message, not an error page or a blank screen → AC-8
- [ ] Unset `ARCJET_KEY`, restart, sign in → succeeds, and the log carries the warning that limiting is off → AC-8
- [ ] Block Arcjet at the network level, sign in → succeeds, and the failure is logged → AC-8

## Value sourcing

One per row of the spec's table. These are the ones that fail quietly if a value comes from the wrong place.

- [ ] Sign in on a JPY profile → the stored integer 500 renders as `¥500`, not `¥5` → AC-10
- [ ] The same integer on a USD profile → `$5.00`; on a KWD profile → three decimal places → AC-10
- [ ] Search the repository for a literal `100` in money handling → none outside a test → AC-9
- [ ] Set your profile zone to `Pacific/Kiritimati` and the server's to something far behind it, at an hour where they differ in date → the app's idea of today follows your profile, not the server → AC-13
- [ ] Log an entry late on the last evening of a month in your own zone → it lands in that month, not the next → AC-13
- [ ] Delete your profile row by hand, then load a page that shows money → a plain error, and no amount rendered anywhere on it → AC-15
- [ ] Confirm no signed in code path reads `APP_TIMEZONE` or `APP_CURRENCY`: `grep -rn "APP_TIMEZONE\|APP_CURRENCY" app components lib actions` → only `lib/env.ts`, `lib/money.ts` defaults, and the sign up suggestions → AC-13
- [ ] The sign up currency list renders with no database query in the network tab → AC-11

## Commands

- [ ] `npm run typecheck` → passes → all
- [ ] `npm test` → 113 pass, including the zero decimal and three decimal formatting cases → AC-9, AC-10
- [ ] `npm run test:integration` → 37 pass, against the real backend → AC-11, AC-12, AC-19
- [ ] `npx vitest run --config vitest.integration.config.mts tests/integration/locale-guards.test.ts` → the currency lock, the time zone check, the completeness guard, cross account isolation, and the deletion function all hold → AC-12, AC-18, AC-19
- [ ] `npx playwright test tests/e2e/auth.spec.ts` → 23 pass, including axe at WCAG 2.2 AA on all five public screens in both themes → AC-6
- [ ] `npm run build` → passes → all

## Acceptance-criteria coverage

- **AC-1** profile row from sign up · covered by the sign up and setup steps, with the deviation noted
- **AC-2** verification before anything readable · covered by the unverified tab and wrong code steps
- **AC-3** password and Google end on the same home · covered by the signing in steps
- **AC-4** session survives a closed browser for a week · covered, needs real elapsed time for the week
- **AC-5** sign out closes everything · covered
- **AC-6** no session renders nothing · covered by manual steps and 23 automated e2e checks
- **AC-7** identical reset response, used and expired codes · covered, with the code deviation noted
- **AC-8** attempt limiting, failing open · covered by three steps including the outage case
- **AC-9** minor units everywhere · covered by the unit suite and the literal `100` search
- **AC-10** one integer, three currencies · covered by unit tests and a manual render
- **AC-11** one currency list, database agrees · covered by the drift test in the integration suite
- **AC-12** currency locks, incomplete profile refuses an entry · covered by `locale-guards`
- **AC-13** today and the month come from your zone · covered by unit tests and two manual steps
- **AC-14** incomplete profile routes to setup · covered, now the path for every new account
- **AC-15** unreadable profile shows an error, never money · covered by the deleted profile step
- **AC-16** name and zone always changeable, currency only before history · covered
- **AC-17** password change ends other sessions · covered, with the emailed code deviation noted
- **AC-18** deletion needs your own address and leaves nothing · covered
- **AC-19** only your own rows · covered by `locale-guards` and `row-level-security` across two real accounts
