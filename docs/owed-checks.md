# Owed checks

Every verification step this project has written down and not yet closed, in one
place, grouped by **what is blocking it** rather than by which feature it came
from. That grouping is the point: one screen reader session closes thirteen of
these, one test mailbox closes seven, and a fair number need nothing at all
except somebody sitting down for twenty minutes.

Nothing here is a known defect. These are checks that have not been run, not
checks that failed. A failing check would be a bug and would be fixed, not
listed.

The per feature detail, with the exact expected result for each step, stays in
each spec's `verify.md`. This file is the index and the plan.

_Written 2026-08-27, at the end of Release 1. Counts: 43 open steps across six
specs, plus the four listen through items in
[accessibility-pass.md](accessibility-pass.md)._

_Spec 0010 shipped after this file was written and has not been rolled in. One
of its open steps is indexed below, in group 6, because it belongs to a group
that already exists. The other seven stay in
[its verify.md](specs/0010-export-and-backup/verify.md) until somebody does the
merge properly._

## The short version

| Blocked by | Steps | What it would take |
|---|---|---|
| A screen reader session | 13 | One sitting with VoiceOver or NVDA |
| Nothing, just nobody has run them | 11 | Twenty minutes of clicking |
| A real test mailbox | 7 | A mailbox the tests can read |
| Blocking Arcjet at the network level | 3 | A proxy or firewall rule |
| A real date arriving | 5 | The last day of a month, and a week passing |
| A deliberate source change to force a failure | 4 | A scratch branch |
| Test harness work | 2 | See below, both are real gaps |
| Your go ahead, because they have side effects | 2 | A yes |
| A production deployment | 1 | A deploy, then a fortnight of Sentry |

## 1. Waiting on a screen reader session

The largest cluster, and the one that has been owed longest. Every one of these
is about whether something is *spoken*, which no automated tree check can
answer. `axe` is clean everywhere and the accessibility tree is correct; what is
missing is a person listening.

From [spec 0003](specs/0003-design-system-ui-foundation/verify.md):

- Submit a form with an error, the message is spoken and focus does not move
- With both a hint and an error, the hint is read before the error
- A `Skeleton` replaced by content leaves no stale "loading" announcement
- Each of the ten category chips announces its name, never a colour
- The bottom tab bar on a phone announces the active tab as current

From [spec 0006](specs/0006-log-a-spend/verify.md):

- Saving a spend, the confirmation is spoken
- Triggering a field error, the reason is announced and tied to its field

From [spec 0007](specs/0007-this-months-transactions/verify.md):

- Confirming a delete, the outcome is spoken and focus lands on the status message
- Arriving at the list after an edit, the confirmation is spoken

From [accessibility-pass.md](accessibility-pass.md), the four standing items:

- The confirmation is actually spoken on a save, not swallowed
- The amount is read as money rather than digit by digit
- A refused save announces the field error without hunting for it
- The native date picker is usable by keyboard on a phone reader

**Worth knowing:** `AGENTS.md` states the rule as "UI meets WCAG AA: reachable by
keyboard, correct to a screen reader". The keyboard half is proved on every
feature. The second half has never been checked by ear on any of them. This is
the one stated project rule currently unmet across the whole of Release 1.

## 2. Blocked by nothing at all

These need no equipment, no waiting, and no decision. They are open because
nobody has run them.

From [spec 0006](specs/0006-log-a-spend/verify.md):

- Sign in and land on `/`, the Log tab is selected, the heading reads "Log a spend", the amount field has focus
- Type `.99` then `007`, both accepted, as 99 cents and 7 dollars
- Submit with no category chosen, refused and nothing written
- Tab through the whole form, every control reachable in the order amount, category, date, note, submit

From [spec 0005](specs/0005-where-your-money-went/verify.md):

- Log three equal spends in three categories, shares read 34, 33, 33 and the 34 sits on the row listed first

From [spec 0007](specs/0007-this-months-transactions/verify.md):

- Clear a note and save, the note is removed rather than left as it was
- Type more decimal places than the currency has, refused, other fields keep what you typed
- Cancel the delete confirm with the Cancel button rather than Escape, focus returns to Delete
- Delete the last entry in a month, the empty state appears and the confirmation is still announced
- Confirm the real backend row limit and check the cap in `lib/month.ts` sits below it

From [spec 0004](specs/0004-sign-in-and-your-account/verify.md):

- With a second browser signed in on the same account, change the password in the first, the second stops working on its next request

**This is the cheapest group by a distance.** Most of these sit right next to
something already proved.

## 3. Waiting on a real test mailbox

Every one needs a six digit code that arrives by email. The project signs its
test accounts up by hand for exactly this reason, so these have never run.

From [spec 0004](specs/0004-sign-in-and-your-account/verify.md):

- While unverified, opening `/` in a new tab redirects to sign in with no account data on screen
- A wrong code says it is wrong or expired and offers a fresh one, and "Send another code" delivers
- Using the same code a second time says it is used or expired and offers a fresh one
- Changing your password from `/settings` using the emailed code, the old one stops working
- Signing in with the old password afterwards is refused

Also here, indirectly: making an unverified account at all needs a mailbox.

**What would fix the group:** a catch all test mailbox with an API (Mailosaur,
MailSlurp, or a self hosted equivalent). That is a decision with a cost, not a
task, so it belongs in a spec if you want it.

## 4. Waiting on network level control of Arcjet

From [spec 0004](specs/0004-sign-in-and-your-account/verify.md):

- Block Arcjet at the network level, sign in, it succeeds and the failure is logged
- The same against `/verify` and the password change form on `/settings`
- Separately, confirm whether InsForge refuses a run of wrong codes on its own side

Arcjet runs on the server, so a browser test cannot block it. These need a proxy
or firewall rule around the running app. The fail open design is the thing being
checked, and it is the kind of thing that is only ever wrong in production.

## 5. Waiting on a date to arrive

Nothing to do but be there when it happens, or fake the clock.

- **The last evening of a month**, in your own zone: does an entry land in the right month, and does the heading roll over? Three steps want this, across specs 0004, 0005, and 0007.
- **The first of a month**: does the heading name that month and not the previous one? Spec 0005.
- **A week passing**: is the session still alive? Spec 0004, and see the harness note below.

The mechanism underneath all of these is already proved: the calendar day comes
from the profile's timezone, checked on 2026-08-27 across two zones a day apart.
What is unproved is the boundary behaviour on the specific day it matters.

## 6. Needing a deliberate source change to force a failure

Each of these proves the app fails *loudly*, so each needs a failure staged on a
scratch branch and then thrown away.

- Lower `MAX_MONTH_ROWS` in `lib/month.ts` below the row count, the error boundary names the shortfall and shows no total ([spec 0007](specs/0007-this-months-transactions/verify.md))
- Rename `amount_minor` in a scratch schema, the screen fails loudly naming the table rather than showing a wrong number ([spec 0005](specs/0005-where-your-money-went/verify.md))
- Change a starting category in the seed migration, a new account gets the new value and existing accounts are untouched ([spec 0002](specs/0002-data-model/verify.md))
- Lower `EXPORT_PAGE_SIZE` in `lib/export.ts` so a page seam is reachable by hand, then save a backdated entry from a second session between two pages, the export refuses with the long message and no file downloads ([spec 0010](specs/0010-export-and-backup/verify.md))

The guards themselves are proved: `assertCompleteMonthRead` was exercised
directly and refuses both a short read and a missing count, and the export's own
guard is covered in both directions by `tests/unit/export-completeness.test.ts`.
What is unproved is the path from the throw to the error boundary.

The export step is new, and it is here because the check that was supposed to
cover it could not. "Insert a transaction from a second session while an export
is paging" is ticked in spec 0010 and passes, but an entry dated today sorts
above the keyset cursor in a descending read, so a later page never sees it and
the count race is never touched. Only a backdated entry lands below the cursor,
and lowering the page size is what makes the seam reachable without logging a
thousand rows first.

## 7. Test harness work, and both are real gaps

**The signed in suite has no refresh token, so nothing exercises the refresh
path.** `signed-in.setup.ts` builds its session from a raw API call rather than
the sign in form, so the browser gets one cookie, `insforge_access_token`, with
`expires: -1`. A real sign in goes through `createAuthActions` and writes two,
including an httpOnly refresh token. The access token lives fifteen minutes and
every test finishes well inside that, so `updateSession` in `proxy.ts` and
`/api/auth/refresh` have never been run by anything. This is why AC-4 in spec
0004 cannot be closed, and it is worth more than the one step it blocks: session
renewal is what stands between a daily use app and being silently signed out.

**The delete flow has no automated browser test.** Everything up to the confirm
is covered, but confirming removes a row that `breakdown.signed.spec.ts` counts,
and the two files run in parallel against one account. Giving the signed in
suite its own account fixes both this and part of the above.

Related, and not harness work but real: **AC-18 and AC-14 of spec 0007 have no
automated coverage at all**, so a delete that stops working, or a month move
that stops explaining itself, would regress silently. `/test this month's
transactions` is the answer.

## 8. Needing your go ahead, because they have side effects

- **The `/forgot-password` timing comparison** ([spec 0004](specs/0004-sign-in-and-your-account/verify.md)). Comparing an address that has an account against one that does not means triggering real password reset emails, and enough of them to compare timing risks tripping the attempt limiter on a live account. Worth doing: this is the step that caught a real information leak the first time it ran.
- **Saving with the backend stopped or offline** ([spec 0006](specs/0006-log-a-spend/verify.md)), which should give an honest failure saying nothing was recorded. Needs the backend deliberately taken down.

## 9. Waiting on a production deployment

Checks rather than doubts: the reasoning is settled and the change is made, but
it cannot be confirmed from a laptop.

- **The Arcjet GOAWAY crash stops happening** (the Sentry issue reading `ConnectError: [canceled] received GOAWAY without any open streams`). Only absence proves this one, so it needs a couple of weeks of quiet rather than a single look. The fix removes most of the exposure rather than the cause, which is an unguarded `conn.destroy()` inside `@connectrpc/connect-node`; if it recurs, the note in `lib/attempt-limit.ts` says what the complete fix is and why it was not taken first.

## What this is not

Spec follow ups are a different thing and are not listed here. There are 54 open
across the seven specs, and they are future work and open questions rather than
checks: whether to record amendments before budgets land, whether `merchant`
earns a column, whether dates should read in your own locale. They live in each
spec's `## Follow-up` section, and the product ones are mirrored in the scope's
Deferred list.

## Suggested order

1. **Group 2**, the eleven that need nothing. Cheapest close in the file.
2. **Group 1**, one screen reader session. Closes thirteen and the one project rule currently unmet.
3. **`/test this month's transactions`**, for the two acceptance criteria that can regress silently.
4. **Group 7**, give the signed in suite its own account. Unblocks the refresh path and the delete flow together.
5. Everything else as the dates arrive, or when a test mailbox is worth its cost.
