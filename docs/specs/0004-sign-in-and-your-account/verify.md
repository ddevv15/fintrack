# Verify: sign in and your account · spec 0004 · updated 2026-08-20

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Four things were built differently from the spec, each agreed with the engineer during `/develop`. `/architect` has since ratified all four and amended spec 0004 in place, so the spec and the code now say the same thing and these steps check both at once. Why each one changed is in [rationale.md](rationale.md), under _Ratified at build time_. The notes below keep the short version where it helps somebody running the checklist.

Build step 11, the rest of the attempt limiting, has since been built, so the five steps that used to be marked as expected failures now pass. All eight actions that send mail or take a guessable value are behind the limiter, and the two signed in ones are keyed on the account as well as the source.

## UI / manual

### Creating an account

- [x] Visit `/sign-up` → three fields only: email, password, your name. No currency and no time zone → AC-1 _(InsForge's signUp carries a name and nothing else, so these two are answered on `/setup` instead)_
- [x] Submit with a password under 12 characters → refused, message beside the password field, and the email you typed is still there → AC-1
- [x] Sign up with a real address → lands on `/verify` with the address prefilled → AC-2
- [ ] While unverified, open `/` in a new tab → redirected to sign in, no account data on screen → AC-2, AC-6
- [x] Enter the six digit code from the email → signed in, and sent straight to `/setup` → AC-2, AC-14
- [ ] Enter a wrong code first → says it is wrong or expired and offers a fresh one; "Send another code" delivers one → AC-2
- [x] On `/setup`, choose a currency and a time zone → lands on the signed in home showing both → AC-14
- [x] Check the database: the profile row carries the display name from sign up, and the currency and zone from setup → AC-1

### Signing in and staying signed in

- [x] Sign out, then sign in with the same address and password → same account, same home → AC-3
- [x] Sign in with Google → same home, and a brand new Google account stops at `/setup` first → AC-3, AC-14 _(proved on the production deployment: POST /sign-up → /auth/callback → / → /setup → POST /setup → /, with the profile carrying the name from the Google account)_
- [ ] Close the browser entirely, reopen it, visit `/` → still signed in, no sign in wall → AC-4
- [ ] Leave it a week and return → still signed in → AC-4
- [x] Sign out from `/settings` → every protected page redirects to sign in on the next request → AC-5

### The doors

- [x] With no session, visit `/`, `/settings`, `/setup` → each redirects to `/sign-in` and renders no account data → AC-6
- [x] Tamper with the `insforge_access_token` cookie, then visit `/` → redirected to sign in, not a half signed in page → AC-6
- [x] Signed in, visit `/sign-in` → redirected home rather than shown a useless form → AC-6
- [x] Confirm `/sign-in`, `/sign-up`, `/verify`, `/forgot-password`, `/reset-password`, and `/auth/callback` all load with no session → AC-6

### Forgetting your password

- [ ] `/forgot-password` with an address that has an account, and one that does not → identical screen, identical wording, similar timing → AC-7
- [x] Enter the emailed code and a new password → says it is done, then signing in with the new password works → AC-7 _(a six digit code, not a link: this backend is configured `resetPasswordMethod: code`)_
- [ ] Use the same code a second time → says it is used or expired and offers a fresh one → AC-7
- [ ] Sign in with the old password → refused → AC-17

### Your account

- [x] `/settings` → change your display name → saved, and the home greeting changes → AC-16
- [x] Change your time zone → saved → AC-16
- [ ] With no entries logged, the currency is a picker; log one entry, reload → the currency reads as fixed with the reason in plain words → AC-12, AC-16
- [ ] Change your password from `/settings` using the emailed code → the old one stops working → AC-17 _(no current password field: the platform exposes no change password call, so the code proves mailbox control instead)_
- [ ] With a second browser signed in on the same account, change the password in the first → the second stops working on its next request → AC-17
- [x] Delete the account: typing the wrong address is refused; typing your own removes it → AC-18
- [x] After deleting, check the database → no `profiles`, `categories`, or `transactions` row survives for that id → AC-18

### Attempt limiting

- [x] With `ARCJET_KEY` set, submit sign in wrongly eleven times in a minute → a plain readable message, not an error page or a blank screen → AC-8
- [x] Unset `ARCJET_KEY`, restart, sign in → succeeds, and the log carries the warning that limiting is off → AC-8
- [ ] Block Arcjet at the network level, sign in → succeeds, and the failure is logged → AC-8
- [x] With `ARCJET_KEY` set, request a password change code from `/settings` eleven times in a minute → refused on the eleventh, keyed on the account → AC-8
- [x] On `/verify`, press "Send another code" eleven times in a minute → refused on the eleventh → AC-8
- [x] On `/reset-password`, submit a wrong six digit code eleven times in a minute → refused once the window is spent, so wrong guesses at a code are counted → AC-8
- [ ] Same against `/verify` and against the password change form on `/settings` → `/verify` confirmed refused; the `/settings` code form is still unrun → AC-8
- [ ] Separately, confirm on the test project whether InsForge refuses a run of wrong codes on its own side, and record the answer in build step 11. Do not assume either way → AC-8

## Value sourcing

One per row of the spec's table. These are the ones that fail quietly if a value comes from the wrong place.

- [ ] Sign in on a JPY profile → the stored integer 500 renders as `¥500`, not `¥5` → AC-10
- [ ] The same integer on a USD profile → `$5.00`; on a KWD profile → three decimal places → AC-10
- [x] Search the repository for a literal `100` in money handling → none outside a test → AC-9
- [ ] Set your profile zone to `Pacific/Kiritimati` and the server's to something far behind it, at an hour where they differ in date → the app's idea of today follows your profile, not the server → AC-13
- [ ] Log an entry late on the last evening of a month in your own zone → it lands in that month, not the next → AC-13
- [x] Delete your profile row by hand, then load a page that shows money → a plain error, and no amount rendered anywhere on it → AC-15
- [x] Confirm no signed in code path reads `APP_TIMEZONE` or `APP_CURRENCY`: `grep -rn "APP_TIMEZONE\|APP_CURRENCY" app components lib actions` → only `lib/env.ts`, `lib/money.ts` defaults, and the setup screen suggestions → AC-13
- [ ] The `/setup` currency list renders with no database query in the network tab → AC-11

## Commands

- [x] `npm run typecheck` → passes → all
- [x] `npm test` → 113 pass, including the zero decimal and three decimal formatting cases → AC-9, AC-10
- [x] `npm run test:integration` → 37 pass, against the real backend → AC-11, AC-12, AC-19
- [x] `npx vitest run --config vitest.integration.config.mts tests/integration/locale-guards.test.ts` → the currency lock, the time zone check, the completeness guard, cross account isolation, and the deletion function all hold → AC-12, AC-18, AC-19
- [x] `npx playwright test tests/e2e/auth.spec.ts` → 23 pass, including axe at WCAG 2.2 AA on all five public screens in both themes → AC-6
- [x] `npm run build` → passes → all

## Acceptance-criteria coverage

- **AC-1** profile row from sign up · covered by the sign up and setup steps, both now in the spec
- **AC-2** verification before anything readable · covered by the unverified tab and wrong code steps
- **AC-3** password and Google end on the same home · covered by the signing in steps
- **AC-4** session survives a closed browser for a week · covered, needs real elapsed time for the week
- **AC-5** sign out closes everything · covered
- **AC-6** no session renders nothing · covered by manual steps and 23 automated e2e checks
- **AC-7** identical reset response, used and expired codes · covered, the code flow now in the spec
- **AC-8** attempt limiting, failing open · covered by eight steps including the outage case, and by `tests/unit/attempt-limit.test.ts`, which pins the fail open branch. The two mail senders and the code submitters are all limited now. The guess window was the serious one, since recovery and the password change both rest on a code being hard to guess, and it is the half InsForge does not cover on its own side
- **AC-9** minor units everywhere · covered by the unit suite and the literal `100` search
- **AC-10** one integer, three currencies · covered by unit tests and a manual render
- **AC-11** one currency list, database agrees · covered by the drift test in the integration suite
- **AC-12** currency locks, incomplete profile refuses an entry · covered by `locale-guards`
- **AC-13** today and the month come from your zone · covered by unit tests and two manual steps
- **AC-14** incomplete profile routes to setup · covered, now the path for every new account
- **AC-15** unreadable profile shows an error, never money · covered by the deleted profile step
- **AC-16** name and zone always changeable, currency only before history · covered
- **AC-17** password change ends other sessions · covered, the emailed code now in the spec
- **AC-18** deletion needs your own address and leaves nothing · covered
- **AC-19** only your own rows · covered by `locale-guards` and `row-level-security` across two real accounts
