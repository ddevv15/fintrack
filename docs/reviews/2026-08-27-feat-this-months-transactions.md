# Review, feat/this-months-transactions, 2026-08-27

**Reviewed by**: Claude (Sonnet 5) (author on Claude Code)
**Scope**: 22 files, branch vs base (`main`, merge base `a8c138a`)
**Verdict**: Blocked

## Summary

Spec 0007 adds a read-only month list, an edit route, and an in-row delete, all built on a shared `lib/month.ts` window/filter so `/transactions` and `/breakdown` cannot silently disagree about a month's total — a genuinely good piece of engineering, reinforced by a structural test (`month-window.test.ts`) that fails if either loader hand-writes its own filter. Row level security, the composite category foreign key, and the money round-trip (`formatAmountInput` / `parseAmount`) are all handled carefully and correctly.

The verdict is **Blocked** because a prior `/check verify` pass against the running app already found AC-13 failing: the edit confirmation shows only about half the time, and when it does show it can be replayed by the back button, which AC-13 explicitly forbids. That defect is not re-litigated here (see the checklist recorded in commit `bef6977`); it is listed below only so this document reflects the true mergeability of the branch. What this review adds is *why*, at a design level, that failure is close to inevitable, plus two new problems in the same area, plus a coverage gap on exactly the concurrency/edge-case logic spec 0007 itself calls out as critical.

## Blockers

### 🔴 AC-13 fails: the edit confirmation is lost roughly half the time, and can replay via back/forward, `lib/flash.ts` + `proxy.ts`

**Problem**: Already confirmed by a `/check verify` run (not rediscovered in this review): after `updateTransaction` returns, two RSC GET requests for `/transactions` fire — one from the action's `revalidatePath("/transactions")`, one from `EditSpendForm`'s `router.push("/transactions")` — and `proxy.ts`'s `carryFlash()` (lines 78–94) hands the flash to whichever one reaches it first, deleting the cookie for both. Separately, a shown confirmation can be re-displayed by pressing back then forward, which AC-13 explicitly forbids.

**Why it matters**: AC-13 is a stated acceptance criterion, and the failure is a wrong/missing confirmation on a money-editing screen, which is the exact class of thing rule 3 of `AGENTS.md` treats as worse than an honest error. `tests/e2e/transactions.signed.spec.ts`'s "opens prefilled, saves, and confirms exactly once" test is flaky as a direct result (observed failing 1 of 3 runs), which will make CI red intermittently.

**Suggested fix**: See the Major finding below for a concrete root-cause hypothesis and a simpler alternative design. At minimum this needs to stop being a race before merge.

## Major

### 🟠 A simpler, already-available mechanism would remove this whole class of bug, `lib/flash.ts`, `proxy.ts:78-94`, `components/transactions/EditSpendForm.tsx:85-91`

**Problem**: The single-use flash is a cookie set by the action, read once by a header the proxy injects, and cleared by the proxy on the same request. It only works if exactly one HTTP request for `/transactions` reaches the proxy between the action returning and the list rendering — a guarantee this PR does not actually have. Two things push against it:

1. This PR also removes `prefetch: false` from the `/transactions` nav tab (`components/ui/AppShell.tsx`), so by the time an edit is saved, Next's Router Cache typically already holds a prefetched entry for `/transactions`. `revalidatePath("/transactions")` invalidates that entry and, per Next's own prefetch/revalidation machinery, the resulting background refresh is itself sent with the `next-router-prefetch` semantics — which is exactly the request `carryFlash()` is written to *ignore* (`!request.headers.get("next-router-prefetch")`, line 81). If `router.push("/transactions")` then reuses that just-refreshed cache entry instead of issuing its own fresh, non-prefetch request, the page that gets shown was rendered by a request the proxy deliberately never attached the flash to. This is a plausible, coherent mechanism for a failure that is intermittent rather than constant, matching what verify observed.
2. The flash cookie is not scoped to the navigation that created it. It is a plain, unscoped, `sameSite: "lax"` cookie shared by every tab of the browser. If a second tab (or the same tab via an unrelated background prefetch) makes any qualifying request to `/transactions` before the edit's own navigation lands, that request — not the one from the edit — can consume and delete the cookie, per `carryFlash()`'s "whichever arrives first" behaviour. Nothing in the design ties the flash to a specific save.

**Why it matters**: this is precisely the mechanism the confirmed AC-13 failure depends on, and it is fragile in a way that is very hard to fix by tweaking the proxy in isolation, because the race is between two different subsystems (Next's Router Cache and an HTTP proxy) that don't coordinate.

**Suggested fix**: the confirmation message is already available on the client without any of this. `updateTransaction`'s `FormState.message` is returned synchronously to `EditSpendForm`'s `useActionState` reducer (`components/transactions/EditSpendForm.tsx:85-91`) before `router.push` is ever called. Handing that string to the list via `sessionStorage` (write it right before the push, read-and-clear it once on the list's mount) needs no cookie, no proxy header, and no dependency on which of two server requests wins — the race disappears because there is only one client, not two competing server requests. It still needs care for the same back/forward replay AC-13 forbids (clear it immediately on first read, not on a timer), but that is a strictly smaller problem than the one solved today. If a server-side flash is kept for the no-JavaScript path, it should not also be relied on for the JavaScript path where a client-side handoff is available and simpler.

### 🟠 Zero test coverage for the exact concurrency/edge-case logic spec 0007 calls "critical", `actions/transactions.ts:371-409`, `:462-487`

**Problem**: `TESTS = configured`, so new branching/error-handling logic needs coverage. None of the following is exercised by any unit, integration, or e2e test in this diff:

- AC-19, the "already gone" zero-rows race, for **either** `updateTransaction` (line 377) or `deleteTransaction` (line 468).
- AC-18, a confirmed delete actually succeeding and reporting what was removed (line 483-486) — `tests/e2e/transactions.signed.spec.ts` explicitly stops short of clicking Confirm, by design, to protect the shared seed fixture, and defers this to manual `/check verify`.
- AC-14, an edit that moves an entry to a different month and names the month it moved to (line 391-401).

These are exactly the scenarios spec 0007's own "Critical test scenarios" section lists as needing to be verified (the failure case for AC-19, the edge case for AC-14). "Proved by hand in `/check verify`" is a reasonable call for the one destructive path that would corrupt the shared e2e fixture (the delete confirm), but it does not extend to the zero-rows race or the month-move message, neither of which is destructive to run and neither of which touches the shared fixture — a fresh row inserted and then raced/moved would be enough.

**Why it matters**: this is money-message and race-condition logic, the two categories the project's own conventions treat as highest risk (rule 3 of `AGENTS.md`), and both new action functions are essentially unverified outside the one happy-path edit test.

**Suggested fix**: at minimum, a small integration or e2e addition that inserts a throwaway row, deletes it out from under an in-flight `updateTransaction`/`deleteTransaction` call (or simply calls the action twice), and asserts the "already gone" message; and one that edits a seeded date into another month and asserts the moved-away wording. Neither requires touching the shared breakdown fixture.

## Minor

### 🟡 `updateTransaction`'s "already gone" branch doesn't revalidate, unlike delete's identical branch, `actions/transactions.ts:377-383`

**Problem**: When `deleteTransaction` matches zero rows (line 468-476), it still calls `revalidatePath("/transactions")` and `("/breakdown")`, with the comment "it is showing a row that no longer exists and leaving it there is its own small lie." `updateTransaction`'s zero-rows branch (line 377-383) is the identical race — the entry was removed elsewhere between load and save — but does not revalidate either route.

**Why it matters**: the same rationale the author wrote for delete applies unchanged to update. In practice a person hitting this in `updateTransaction` sees the error on the edit screen, and if they then navigate back to `/transactions` before the router cache would otherwise refresh, they may still see the row that both actions agree is gone.

**Suggested fix**: call the same two `revalidatePath()` lines in `updateTransaction`'s zero-rows branch that `deleteTransaction` already calls in its own.

### 🟡 The proxy's flash-cookie deletion is silently discarded on the signed-out redirect path, `proxy.ts:97-115`

**Problem**: `carryFlash()` mutates `response.cookies` to delete `FLASH_COOKIE` (line 91) and that `response` is what `proxy()` intends to return. But if the same request turns out to have no valid session (`!accessToken && !isPublic(pathname)`, line 110), `proxy()` returns a brand new `NextResponse.redirect(...)` (line 114) instead of the `response` built by `carryFlash()`, so the cookie-deletion mutation is thrown away.

**Why it matters**: narrow — it requires a session to expire in the exact window between setting the flash and the list request that would consume it — but when it happens the flash cookie outlives the request meant to clear it, for one more round trip than intended (bounded by the 60 second `maxAge`, so not unbounded).

**Suggested fix**: worth a one-line comment acknowledging the tradeoff if it's accepted as-is, or delete the cookie on the redirect response too.

## Strengths

- `lib/month.ts` centralising the window, the spend filter, the row cap, and the completeness guard — and `tests/unit/month-window.test.ts` enforcing it by scanning both loaders' source for hand-written duplicates — is a genuinely effective way to close off the exact "two totals for one month, nothing complains" failure spec 0007 is worried about.
- `formatAmountInput()` splitting digits rather than dividing, verified by a round-trip test across a zero-, two-, and three-decimal currency with real edge values (`tests/unit/transactions.test.ts`), correctly extends the no-arithmetic-outside-`lib/money.ts` rule to the new edit form.
- `listSpendCategoryOptions()`'s `.or(\`is_hidden.eq.false,id.eq.${currentCategoryId}\`)` string-builds a PostgREST filter, which would normally be a red flag, but `currentCategoryId` is provably a Zod-validated uuid from a row this account already owns before it ever reaches this function — checked, and correct.
- Ownership handling throughout `actions/transactions.ts` and `lib/transactions.ts` never names `user_id`, and the reasoning about the composite `(user_id, category_id, direction)` foreign key doing the real work matches the RLS policies actually defined in `migrations/20260819013240_core-schema.sql`.

## Test coverage

Well covered: the pure summing/ordering/total logic (`summariseTransactions`), the shared month window (`currentSpendMonth`, plus the anti-drift structural test), the amount round trip, the happy-path edit flow, not-found handling for both an unknown and a malformed id, and accessibility at WCAG 2.2 AA including the delete confirm state.

Not covered anywhere (unit, integration, or e2e): AC-19's zero-rows race for both actions, AC-18's delete success path, and AC-14's month-move confirmation — see the Major finding above. These are branching and error-handling paths, not merely missing happy-path polish.
