# Review, feat/design-system, 2026-08-20

**Reviewed by**: Claude Sonnet 5 (author on Claude Opus 5 / Sonnet 5)
**Scope**: 42 files, branch vs `main` (merge base `e4f39bc`)
**Verdict**: Approve with nits

## Summary

This lands the token-first design system from spec 0003: a `@theme` CSS layer with light/dark values for every colour, sixteen server-rendered components over native HTML elements, the `/design` gallery gated behind `UI_GALLERY`, and a strong test story (contrast math in Vitest, axe + keyboard + reduced-motion + touch-target checks in Playwright). This is a re-review of the branch as it now stands, after commit `f733f21` addressed the previous review's one Major (`UI_GALLERY=` crashing every route) and two of its Minors (currency-coupled e2e assertions, the dev-toolbar target-size failure). I re-verified all three fixes directly rather than trusting the commit message, and re-audited the ~37 files that were unchanged since the last pass. The env fix is correct and well tested; the dev-toolbar skip is correct and I confirmed it against a live dev server. The currency-pin fix is real but incomplete — it closes the common case but not the case where a developer already has `npm run dev` running, which is exactly this project's own local setup. Nothing else rises above Minor: the two items the task description said were deliberately left unfixed (`AppNav`'s console 404s, `formatCents`'s zero-decimal-currency bug) are still present and still correctly out of scope for this PR.

## Minor

### 🟡 The `APP_CURRENCY` e2e fix only works when Playwright starts its own server; a developer's already-running `npm run dev` still breaks AC-11/AC-13, `playwright.config.ts:46`, `tests/e2e/design-system.spec.ts:113`, `:169`

**Problem**: `playwright.config.ts`'s `webServer.env` now pins `APP_CURRENCY: "USD"` and `APP_TIMEZONE: "America/New_York"`, which fixes the case the previous review reproduced. But `webServer.reuseExistingServer` is `!process.env.CI`, i.e. `true` for any local run, and Playwright's server-reuse check only tests whether something is listening on `localhost:3000` — it does not check whether that process was started with the pinned env. I reproduced this directly: with a `npm run dev` server already up (started with this repo's own `.env.local`, which sets `APP_CURRENCY=INR`), `UI_GALLERY=1 npx playwright test -g "AC-11"` failed waiting for `+$42.50` because the page actually rendered `+₹42.50`; killing that server and re-running the identical command against a Playwright-spawned server passed. This is not a hypothetical — leaving a dev server running in one terminal while running tests in another is a completely ordinary workflow, `AGENTS.md`'s own Commands section lists `npm run dev` as the standard way to work, and this project's actual `.env.local` (`APP_CURRENCY=INR`) reproduces the failure verbatim.

**Why it matters**: this is the same class of problem the fix was meant to close — a developer running the documented `npm run test:e2e` command on an unmodified machine gets a failure that reads as a product bug (wrong currency symbol) and is not. It is strictly better than before (the previously-reproduced "always fails, even with a fresh server" case is fixed), but the fix's own comment in the config ("If you already have a dev server up without it, stop that server or the gallery tests will 404") only anticipates the `UI_GALLERY`-missing case, not this one, so a developer hitting this has no signpost telling them why.

**Suggested fix**: either extend the existing comment to cover the currency/timezone case too (cheapest, matches how the `UI_GALLERY` risk is already documented), or make the tests resilient to the configured currency by reading `APP_CURRENCY`/`APP_TIMEZONE` from the environment in the test file instead of hardcoding `$`-formatted strings.

### 🟡 `verify.md`'s recorded test counts are stale after the fix commit, `docs/specs/0003-design-system-ui-foundation/verify.md:9`

**Problem**: `npm run test → 93 pass` was recorded on 2026-08-19, before `tests/unit/env.test.ts` added 9 tests for the `UI_GALLERY` regression. The suite now runs 105 tests (I ran it: `Test Files 6 passed (6)`, `Tests 105 passed (105)`). The verify doc was not touched by the fix commit.

**Why it matters**: small, but this file's entire purpose is to be the reproducible record `/check verify` re-runs and trusts; a stale count is the first thing to make a reader wonder what else in the file wasn't updated.

**Suggested fix**: bump the count next time verify.md is touched; not worth a commit on its own.

## Nits

- ⚪ `app/error.tsx:16`, the default export is internally named `GlobalError`, but this is the route-level `error.tsx`, not the different `global-error.tsx` boundary Next also supports — same naming nit as the previous review, still unaddressed, still harmless.
- ⚪ `components/ui/Skeleton.tsx:33`, `role="status"` already implies `aria-live="polite"`; both are set explicitly. Redundant, not wrong.
- ⚪ `AGENTS.md` still describes `components/` as flat and doesn't list `lucide-react`/`clsx`/`tailwind-merge`/`@axe-core/playwright` or the `accessibility` skill. The spec's own Follow-up list already flags this for `/sync`; not a defect in this PR.
- ⚪ `components/ui/AmountInput.tsx:51`, the adornment's `2ch` left padding assumes a short currency glyph; `currencySymbol()` can return up to 4 characters for some ISO codes (verified: `XPF` → `"CFPF"`). Low risk while `APP_CURRENCY` is fixed to a short-glyph currency; carried from the previous review, still unaddressed, still not blocking.

## Strengths

- The `UI_GALLERY` fix is genuinely well done, not just patched: `tests/unit/env.test.ts` locks the exact regression (`UI_GALLERY: ""` must not fail `APP_CURRENCY` too), plus the "is false when absent," the four valid values, and — importantly — that a real typo (`"yes"`, `"TRUE"`, `" 1"` with a leading space) still throws. I verified the schema by hand outside the test file too: it accepts `""` and `undefined` alike, and still rejects anything else. The fix does not weaken typo detection at all, which was the risk worth checking.
- The dev-toolbar skip in the 44×44 sweep is specific rather than a blanket exclusion: it checks the actual `data-nextjs-dev-tools-button` attribute Next 16 puts on the element (I found it in `node_modules/next/dist/compiled/next-devtools/index.js`), not a guess at a selector. I confirmed the fix live: the test failed before removing a stale dev server assumption and passed cleanly against a fresh one.
- `tests/unit/tokens.test.ts` re-derives real WCAG contrast ratios from the OKLCH values in `app/globals.css` on every run, so a design-token regression fails the build instead of waiting for someone to notice a chip looks off.
- The exhaustive `Record<CategoryColor, string>` pattern in `CategoryChip` is tested at the one place an interpolated Tailwind class would actually fail silently: `tests/e2e/design-system.spec.ts` reads computed `background-color` in a production build, not just the class list.
- `docs/accessibility-pass.md` is honest about what's verified (automated tooling, the accessibility tree) versus what's owed (a real screen reader), and `docs/scope/scope.md` correctly leaves the "Build it" checkbox unchecked pending that pass — no confident gloss over an acknowledged gap.
- Every reviewed component held its contract: `Amount`/`DateDisplay` never format independently of `lib/money.ts`/`lib/time.ts`, `AppNav` remains the only client component, and no hex/`rgb()` value or interpolated Tailwind class exists anywhere in `components/` or `app/` (confirmed by re-running the grep from `verify.md` and by reading every changed component file directly).

## Test coverage

Strong for what's machine-checkable: unit tests lock `formatCents`, `currencySymbol`, `formatPlainDate`, the token contrast/distinctness contract, and now the `UI_GALLERY` env regression with real assertions, not snapshots. e2e covers axe (both themes, both gallery routes), keyboard order, focus-ring visibility, reduced motion, 320px truncation, and touch targets, and I re-ran the target-size and axe-adjacent tests directly against a live dev server rather than trusting the suite's own green state. The one gap found this pass — `APP_CURRENCY`/`APP_TIMEZONE` assertions in `tests/e2e/design-system.spec.ts` still being sensitive to whatever server Playwright happens to reuse locally — is documented above as Minor rather than Major because CI is unaffected (CI always builds fresh) and it fails loud and immediately rather than passing silently wrong. AC-8 (the human screen-reader pass) remains honestly tracked as not-yet-done, which is correct and not a finding.

## Carried forward, not re-litigated

Two items the branch author already decided not to fix in this PR, both still present and both still reasonable to leave for a later feature:

- `AppNav`'s default `navItems` point at `/transactions` and `/breakdown`, which don't exist yet, so `/design` logs two console 404s from `next/link` prefetch. Tracked as **open** in `verify.md`; will resolve itself once features 7 and 8 land.
- `formatCents()` divides by 100 regardless of a currency's real minor-unit count (`formatCents(1250, "JPY")` → `"¥13"`, not `"¥1,250"`). This lives in `lib/money.ts` under spec 0001 and is unchanged by this diff; out of scope here.
